import { createSignal, createMemo } from "solid-js";
import type { VoiceMediaState, VoiceParticipant } from "../lib/types";
import { PeerConnectionManager } from "../lib/webrtc";
import {
  joinVoiceChannel,
  leaveVoiceChannel,
  updateVoiceMediaState,
  sendVoiceSdp,
  sendVoiceIceCandidate,
  getTurnCredentials,
} from "../lib/tauri";
import { identity } from "./identity";

// module-scoped signals following the store pattern
const [voiceChannelId, setVoiceChannelId] = createSignal<string | null>(null);
const [voiceCommunityId, setVoiceCommunityId] = createSignal<string | null>(
  null,
);
const [voiceParticipants, setVoiceParticipants] = createSignal<
  VoiceParticipant[]
>([]);
const [localMediaState, setLocalMediaState] = createSignal<VoiceMediaState>({
  muted: false,
  deafened: false,
  video_enabled: false,
  screen_sharing: false,
});
const [localStream, setLocalStream] = createSignal<MediaStream | null>(null);
const [remoteStreams, setRemoteStreams] = createSignal<
  Map<string, MediaStream>
>(new Map());
const [screenStream, setScreenStream] = createSignal<MediaStream | null>(null);

// per-peer WebRTC connection state tracking
const [peerConnectionStates, setPeerConnectionStates] = createSignal<
  Record<string, RTCPeerConnectionState>
>({});

// tracks the voice connection lifecycle so the ui can show proper feedback
export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "degraded"
  | "error";
const [voiceConnectionState, setVoiceConnectionState] =
  createSignal<VoiceConnectionState>("idle");
const [voiceError, setVoiceError] = createSignal<string | null>(null);

// overall voice connection quality summary derived from per-peer states
const voiceQuality = createMemo(() => {
  const states = peerConnectionStates();
  const entries = Object.entries(states);
  if (entries.length === 0) return "good";
  const connected = entries.filter(([, s]) => s === "connected").length;
  const failed = entries.filter(([, s]) => s === "failed").length;
  if (failed === entries.length) return "failed";
  if (failed > 0) return "degraded";
  if (connected === entries.length) return "good";
  return "connecting";
});

// derived signal for convenience
export function isInVoice(): boolean {
  return voiceChannelId() !== null;
}

// single peer connection manager instance for the lifetime of a voice session
let peerManager: PeerConnectionManager | null = null;

// evaluate overall voice connection state from per-peer states
function evaluateOverallVoiceState(): void {
  const states = peerConnectionStates();
  const entries = Object.entries(states);

  // if no peers, we're the only participant — stay connected
  if (entries.length === 0) {
    // only update if we're currently in a voice channel (not leaving)
    if (voiceChannelId() !== null && voiceConnectionState() !== "idle") {
      setVoiceConnectionState("connected");
    }
    return;
  }

  const connected = entries.filter(([, s]) => s === "connected").length;
  const failed = entries.filter(([, s]) => s === "failed").length;

  if (connected > 0 && failed > 0) {
    setVoiceConnectionState("degraded");
  } else if (connected > 0) {
    setVoiceConnectionState("connected");
  } else if (failed === entries.length) {
    setVoiceConnectionState("error");
  }
  // otherwise remain in "connecting" state (peers still negotiating)
}

// initialize the peer manager with callbacks wired to our handlers
function initPeerManager(iceServers?: RTCIceServer[]): PeerConnectionManager {
  const manager = new PeerConnectionManager({
    iceServers,
    onRemoteStream: (peerId: string, stream: MediaStream) => {
      console.log(`[Voice] Remote stream received from ${peerId}`);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(peerId, stream);
        return next;
      });
    },

    onRemoteStreamRemoved: (peerId: string) => {
      console.log(`[Voice] Remote stream removed for ${peerId}`);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    },

    onIceCandidate: async (peerId: string, candidate: RTCIceCandidate) => {
      const communityId = voiceCommunityId();
      const channelId = voiceChannelId();
      if (!communityId || !channelId) return;

      try {
        await sendVoiceIceCandidate(
          communityId,
          channelId,
          peerId,
          candidate.candidate,
          candidate.sdpMid,
          candidate.sdpMLineIndex,
        );
      } catch (err) {
        console.error("[Voice] Failed to send ICE candidate:", err);
      }
    },

    onNegotiationNeeded: async (
      peerId: string,
      sdp: RTCSessionDescriptionInit,
    ) => {
      const communityId = voiceCommunityId();
      const channelId = voiceChannelId();
      if (!communityId || !channelId) return;

      // the webrtc module handles glare resolution and creates the offer/restart SDP
      // we just need to send it via the signaling channel
      try {
        console.log(
          `[Voice] Sending ${sdp.type} SDP to ${peerId} (negotiation/restart)`,
        );
        await sendVoiceSdp(
          communityId,
          channelId,
          peerId,
          sdp.type || "offer",
          sdp.sdp || "",
        );
      } catch (err) {
        console.error("[Voice] Failed to send SDP during negotiation:", err);
      }
    },

    onPeerConnectionStateChanged: (
      peerId: string,
      state: RTCPeerConnectionState,
    ) => {
      console.log(`[Voice] Peer ${peerId} connection state: ${state}`);
      setPeerConnectionStates((prev) => ({ ...prev, [peerId]: state }));
      evaluateOverallVoiceState();
    },
  });

  return manager;
}

// acquire local media stream with audio and optionally video
async function acquireLocalMedia(enableVideo: boolean): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: true,
    video: enableVideo,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
}

// acquire screen share stream
async function acquireScreenShare(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  return stream;
}

// release local media stream
function releaseLocalMedia(): void {
  const stream = localStream();
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    setLocalStream(null);
  }
}

// release screen share stream
function releaseScreenShare(): void {
  const stream = screenStream();
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    setScreenStream(null);
  }
}

// join a voice channel
export async function joinVoice(
  communityId: string,
  channelId: string,
): Promise<void> {
  // if already in a voice channel, leave it first
  if (isInVoice()) {
    await leaveVoice();
  }

  setVoiceConnectionState("connecting");
  setVoiceError(null);

  try {
    // acquire local audio stream
    const stream = await acquireLocalMedia(false);
    setLocalStream(stream);

    // fetch TURN credentials from our relay server
    let turnServers: RTCIceServer[] = [];
    try {
      const creds = await getTurnCredentials();
      turnServers = [{
        urls: creds.uris,
        username: creds.username,
        credential: creds.password,
      }];
      console.log(`[Voice] Fetched TURN credentials (ttl=${creds.ttl}s, uris=${creds.uris.length})`);
    } catch (e) {
      console.warn('[Voice] Failed to fetch TURN credentials, proceeding without TURN:', e);
    }

    // combine public STUN servers with dynamic TURN servers
    const iceServers: RTCIceServer[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      ...turnServers,
    ];

    // initialize peer manager and set our local peer id for glare resolution
    peerManager = initPeerManager(iceServers);
    const localPeerId = identity()?.peer_id;
    if (localPeerId) {
      peerManager.setLocalPeerId(localPeerId);
    }
    peerManager.setLocalStream(stream);

    // tell the backend to join the voice channel
    const participants = await joinVoiceChannel(communityId, channelId);

    setVoiceChannelId(channelId);
    setVoiceCommunityId(communityId);
    setVoiceParticipants(participants);

    // determine how many remote peers we need to connect to
    const remotePeers = participants.filter(
      (p) => p.peer_id !== localPeerId,
    );

    if (remotePeers.length === 0) {
      // we're the only participant — no peers to connect to, so we're connected
      console.log("[Voice] No remote peers, marking as connected");
      setVoiceConnectionState("connected");
    }
    // otherwise stay in "connecting" until onPeerConnectionStateChanged fires

    // create peer connections for all existing participants
    // we only initiate offers if our peer id is lexicographically smaller
    for (const participant of remotePeers) {
      peerManager.createConnection(participant.peer_id);

      if (peerManager.shouldOffer(participant.peer_id)) {
        try {
          const offer = await peerManager.createOffer(participant.peer_id);
          await sendVoiceSdp(
            communityId,
            channelId,
            participant.peer_id,
            offer.type || "offer",
            offer.sdp || "",
          );
        } catch (err) {
          console.error(
            `[Voice] Failed to create offer for ${participant.peer_id}:`,
            err,
          );
        }
      }
    }
  } catch (err) {
    console.error("[Voice] Failed to join voice channel:", err);
    // surface a readable error message to the ui
    const message = err instanceof Error ? err.message : String(err);
    setVoiceError(message);
    setVoiceConnectionState("error");
    // clean up on failure
    releaseLocalMedia();
    if (peerManager) {
      peerManager.closeAll();
      peerManager = null;
    }
  }
}

// leave the current voice channel
export async function leaveVoice(): Promise<void> {
  const communityId = voiceCommunityId();
  const channelId = voiceChannelId();

  // close all peer connections
  if (peerManager) {
    peerManager.closeAll();
    peerManager = null;
  }

  // release media streams
  releaseLocalMedia();
  releaseScreenShare();

  // clear remote streams and peer connection states
  setRemoteStreams(new Map());
  setPeerConnectionStates({});

  // tell the backend to leave
  if (communityId && channelId) {
    try {
      await leaveVoiceChannel(communityId, channelId);
    } catch (err) {
      console.error("failed to leave voice channel:", err);
    }
  }

  // reset state
  setVoiceChannelId(null);
  setVoiceCommunityId(null);
  setVoiceParticipants([]);
  setVoiceConnectionState("idle");
  setVoiceError(null);
  setLocalMediaState({
    muted: false,
    deafened: false,
    video_enabled: false,
    screen_sharing: false,
  });
}

// toggle mute - disables audio track locally
export async function toggleMute(): Promise<void> {
  const stream = localStream();
  const currentState = localMediaState();
  const newMuted = !currentState.muted;

  // disable/enable audio track
  if (stream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !newMuted;
    }
  }

  // if deafened, also undeafen
  let newDeafened = currentState.deafened;
  if (newMuted && currentState.deafened) {
    newDeafened = false;
    // unmute remote audio
    for (const [, remoteStream] of remoteStreams()) {
      for (const track of remoteStream.getAudioTracks()) {
        track.enabled = true;
      }
    }
  }

  const newState: VoiceMediaState = {
    ...currentState,
    muted: newMuted,
    deafened: newDeafened,
  };

  setLocalMediaState(newState);

  // notify backend
  const communityId = voiceCommunityId();
  const channelId = voiceChannelId();
  if (communityId && channelId) {
    try {
      await updateVoiceMediaState(communityId, channelId, newState);
    } catch (err) {
      console.error("failed to update media state:", err);
    }
  }
}

// toggle deafen - mutes our mic and mutes all remote audio
export async function toggleDeafen(): Promise<void> {
  const stream = localStream();
  const currentState = localMediaState();
  const newDeafened = !currentState.deafened;

  // mute/unmute our audio track
  if (stream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !newDeafened;
    }
  }

  // mute/unmute all remote audio tracks
  for (const [, remoteStream] of remoteStreams()) {
    for (const track of remoteStream.getAudioTracks()) {
      track.enabled = !newDeafened;
    }
  }

  // when deafening, also mute
  let newMuted = currentState.muted;
  if (newDeafened && !currentState.muted) {
    newMuted = true;
  }

  const newState: VoiceMediaState = {
    ...currentState,
    muted: newMuted,
    deafened: newDeafened,
  };

  setLocalMediaState(newState);

  // notify backend
  const communityId = voiceCommunityId();
  const channelId = voiceChannelId();
  if (communityId && channelId) {
    try {
      await updateVoiceMediaState(communityId, channelId, newState);
    } catch (err) {
      console.error("failed to update media state:", err);
    }
  }
}

// toggle video - acquires or releases video track
export async function toggleVideo(): Promise<void> {
  const currentState = localMediaState();
  const newVideoEnabled = !currentState.video_enabled;

  if (newVideoEnabled) {
    // acquire video track and add to existing stream or create new
    try {
      const videoStream = await acquireLocalMedia(true);
      const videoTrack = videoStream.getVideoTracks()[0];

      if (videoTrack && localStream()) {
        // add video track to existing stream
        localStream()!.addTrack(videoTrack);
        // stop the unused audio tracks from the new stream to prevent resource leak
        for (const audioTrack of videoStream.getAudioTracks()) {
          audioTrack.stop();
        }
      } else if (videoTrack) {
        setLocalStream(videoStream);
      }

      // update peer manager with new stream
      if (peerManager) {
        peerManager.setLocalStream(localStream());
        peerManager.updateTracks();

        // renegotiate with all peers
        const communityId = voiceCommunityId();
        const channelId = voiceChannelId();
        const localPeerId = identity()?.peer_id;

        if (communityId && channelId && localPeerId) {
          for (const participant of voiceParticipants()) {
            if (participant.peer_id === localPeerId) continue;
            if (peerManager.shouldOffer(participant.peer_id)) {
              const offer = await peerManager.createOffer(participant.peer_id);
              await sendVoiceSdp(
                communityId,
                channelId,
                participant.peer_id,
                offer.type || "offer",
                offer.sdp || "",
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("failed to acquire video:", err);
      return;
    }
  } else {
    // remove video track from stream
    const stream = localStream();
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      for (const track of videoTracks) {
        track.stop();
        stream.removeTrack(track);
      }
    }

    // update peer connections
    if (peerManager) {
      peerManager.setLocalStream(localStream());
      peerManager.updateTracks();
    }
  }

  const newState: VoiceMediaState = {
    ...currentState,
    video_enabled: newVideoEnabled,
  };

  setLocalMediaState(newState);

  // notify backend
  const communityId = voiceCommunityId();
  const channelId = voiceChannelId();
  if (communityId && channelId) {
    try {
      await updateVoiceMediaState(communityId, channelId, newState);
    } catch (err) {
      console.error("failed to update media state:", err);
    }
  }
}

// toggle screen share
export async function toggleScreenShare(): Promise<void> {
  const currentState = localMediaState();
  const newScreenSharing = !currentState.screen_sharing;

  if (newScreenSharing) {
    try {
      const screen = await acquireScreenShare();
      setScreenStream(screen);

      if (peerManager) {
        peerManager.setScreenStream(screen);
        peerManager.updateTracks();

        // renegotiate with all peers
        const communityId = voiceCommunityId();
        const channelId = voiceChannelId();
        const localPeerId = identity()?.peer_id;

        if (communityId && channelId && localPeerId) {
          for (const participant of voiceParticipants()) {
            if (participant.peer_id === localPeerId) continue;
            if (peerManager.shouldOffer(participant.peer_id)) {
              const offer = await peerManager.createOffer(participant.peer_id);
              await sendVoiceSdp(
                communityId,
                channelId,
                participant.peer_id,
                offer.type || "offer",
                offer.sdp || "",
              );
            }
          }
        }
      }

      // listen for when the user stops sharing via browser ui
      screen.getVideoTracks()[0]?.addEventListener("ended", () => {
        toggleScreenShare();
      });
    } catch (err) {
      console.error("failed to acquire screen share:", err);
      return;
    }
  } else {
    releaseScreenShare();

    if (peerManager) {
      peerManager.setScreenStream(null);
      peerManager.updateTracks();
    }
  }

  const newState: VoiceMediaState = {
    ...currentState,
    screen_sharing: newScreenSharing,
  };

  setLocalMediaState(newState);

  // notify backend
  const communityId = voiceCommunityId();
  const channelId = voiceChannelId();
  if (communityId && channelId) {
    try {
      await updateVoiceMediaState(communityId, channelId, newState);
    } catch (err) {
      console.error("failed to update media state:", err);
    }
  }
}

// event handlers called from App.tsx when voice events arrive

export function handleVoiceParticipantJoined(payload: {
  community_id: string;
  channel_id: string;
  peer_id: string;
  display_name: string;
  media_state: VoiceMediaState;
}): void {
  // ignore if not for our current voice channel
  if (payload.channel_id !== voiceChannelId()) return;

  // add to participants list
  setVoiceParticipants((prev) => {
    // avoid duplicates
    if (prev.some((p) => p.peer_id === payload.peer_id)) {
      return prev;
    }
    return [
      ...prev,
      {
        peer_id: payload.peer_id,
        display_name: payload.display_name,
        media_state: payload.media_state,
      },
    ];
  });

  // create peer connection for the new participant
  if (peerManager) {
    const localPeerId = identity()?.peer_id;
    if (payload.peer_id === localPeerId) return;

    peerManager.createConnection(payload.peer_id);

    // initiate offer if we should be the offerer
    if (peerManager.shouldOffer(payload.peer_id)) {
      const communityId = voiceCommunityId();
      const channelId = voiceChannelId();
      if (communityId && channelId) {
        peerManager
          .createOffer(payload.peer_id)
          .then((offer) => {
            return sendVoiceSdp(
              communityId,
              channelId,
              payload.peer_id,
              offer.type || "offer",
              offer.sdp || "",
            );
          })
          .catch((err) => {
            console.error("failed to create offer for new participant:", err);
          });
      }
    }
  }
}

export function handleVoiceParticipantLeft(payload: {
  community_id: string;
  channel_id: string;
  peer_id: string;
}): void {
  // ignore if not for our current voice channel
  if (payload.channel_id !== voiceChannelId()) return;

  // remove from participants list
  setVoiceParticipants((prev) =>
    prev.filter((p) => p.peer_id !== payload.peer_id),
  );

  // close peer connection
  if (peerManager) {
    peerManager.closeConnection(payload.peer_id);
  }

  // remove remote stream and peer connection state
  setRemoteStreams((prev) => {
    const next = new Map(prev);
    next.delete(payload.peer_id);
    return next;
  });
  setPeerConnectionStates((prev) => {
    const next = { ...prev };
    delete next[payload.peer_id];
    return next;
  });

  // re-evaluate overall voice state after peer removal
  evaluateOverallVoiceState();
}

export function handleVoiceMediaStateChanged(payload: {
  community_id: string;
  channel_id: string;
  peer_id: string;
  media_state: VoiceMediaState;
}): void {
  // ignore if not for our current voice channel
  if (payload.channel_id !== voiceChannelId()) return;

  // update participant's media state
  setVoiceParticipants((prev) =>
    prev.map((p) =>
      p.peer_id === payload.peer_id
        ? { ...p, media_state: payload.media_state }
        : p,
    ),
  );
}

export async function handleVoiceSdpReceived(payload: {
  community_id: string;
  channel_id: string;
  from_peer: string;
  sdp_type: string;
  sdp: string;
}): Promise<void> {
  // ignore if not for our current voice channel
  if (payload.channel_id !== voiceChannelId()) return;
  if (!peerManager) return;

  const communityId = voiceCommunityId();
  const channelId = voiceChannelId();
  if (!communityId || !channelId) return;

  try {
    if (payload.sdp_type === "offer") {
      // ensure we have a connection for this peer
      if (!peerManager.getConnection(payload.from_peer)) {
        peerManager.createConnection(payload.from_peer);
      }

      // create answer
      const answer = await peerManager.createAnswer(payload.from_peer, {
        type: "offer",
        sdp: payload.sdp,
      });

      await sendVoiceSdp(
        communityId,
        channelId,
        payload.from_peer,
        answer.type || "answer",
        answer.sdp || "",
      );
    } else if (payload.sdp_type === "answer") {
      await peerManager.setRemoteAnswer(payload.from_peer, {
        type: "answer",
        sdp: payload.sdp,
      });
    }
  } catch (err) {
    console.error("failed to handle sdp:", err);
  }
}

export async function handleVoiceIceCandidateReceived(payload: {
  community_id: string;
  channel_id: string;
  from_peer: string;
  candidate: string;
  sdp_mid: string | null;
  sdp_mline_index: number | null;
}): Promise<void> {
  // ignore if not for our current voice channel
  if (payload.channel_id !== voiceChannelId()) return;
  if (!peerManager) return;

  try {
    await peerManager.addIceCandidate(payload.from_peer, {
      candidate: payload.candidate,
      sdpMid: payload.sdp_mid,
      sdpMLineIndex: payload.sdp_mline_index,
    });
  } catch (err) {
    console.error("failed to handle ice candidate:", err);
  }
}

// export signals
export {
  voiceChannelId,
  voiceCommunityId,
  voiceParticipants,
  localMediaState,
  localStream,
  remoteStreams,
  screenStream,
  voiceConnectionState,
  voiceError,
  peerConnectionStates,
  voiceQuality,
};
