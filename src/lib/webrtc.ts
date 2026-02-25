// webrtc peer connection manager for voice/video calls
// manages one RTCPeerConnection per remote peer in a full mesh topology
// this is a utility module with no signals - the voice store drives it

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // Public STUN servers (free, no auth needed)
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // TURN servers are added dynamically via getTurnCredentials()
];

/** Maximum ICE restart attempts before giving up on a peer */
const MAX_ICE_RESTART_ATTEMPTS = 3;

/** Delay before attempting ICE restart after disconnection (ms) */
const DISCONNECT_TIMEOUT_MS = 5000;

export interface PeerConnectionManagerConfig {
  onNegotiationNeeded: (peerId: string, sdp: RTCSessionDescriptionInit) => void;
  onIceCandidate: (peerId: string, candidate: RTCIceCandidate) => void;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved: (peerId: string) => void;
  onPeerConnectionStateChanged?: (peerId: string, state: RTCPeerConnectionState) => void;
  iceServers?: RTCIceServer[];
}

/** Per-peer state tracking beyond just the RTCPeerConnection */
interface PeerState {
  pc: RTCPeerConnection;
  /** ICE candidates received before remote description was set */
  candidateBuffer: RTCIceCandidateInit[];
  /** Number of ICE restart attempts for this peer */
  restartAttempts: number;
  /** Timeout handle for delayed ICE restart after disconnection */
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export class PeerConnectionManager {
  private peers: Map<string, PeerState> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private rtcConfig: RTCConfiguration;

  // the local peer id, used for glare resolution during simultaneous offers
  private localPeerId: string | null = null;

  // ---- legacy callback properties (for backward compat with voice store) ----
  // these are used when the class is constructed without a config object
  onRemoteStream: ((peerId: string, stream: MediaStream) => void) | null = null;
  onRemoteStreamRemoved: ((peerId: string) => void) | null = null;
  onIceCandidate: ((peerId: string, candidate: RTCIceCandidate) => void) | null = null;
  onNegotiationNeeded: ((peerId: string, sdp?: RTCSessionDescriptionInit) => void) | null = null;
  onPeerConnectionStateChanged: ((peerId: string, state: RTCPeerConnectionState) => void) | null = null;

  private config: PeerConnectionManagerConfig | null = null;

  constructor(config?: PeerConnectionManagerConfig) {
    const iceServers = config?.iceServers ?? DEFAULT_ICE_SERVERS;
    this.rtcConfig = {
      iceServers,
      iceTransportPolicy: 'all',
    };

    if (config) {
      this.config = config;
      // Also set legacy callback properties from config for internal use
      this.onRemoteStream = config.onRemoteStream;
      this.onRemoteStreamRemoved = config.onRemoteStreamRemoved;
      this.onIceCandidate = config.onIceCandidate;
      this.onNegotiationNeeded = (peerId: string, sdp?: RTCSessionDescriptionInit) => {
        if (sdp) config.onNegotiationNeeded(peerId, sdp);
      };
      this.onPeerConnectionStateChanged = config.onPeerConnectionStateChanged ?? null;
    }
  }

  setLocalPeerId(peerId: string): void {
    this.localPeerId = peerId;
  }

  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;
  }

  setScreenStream(stream: MediaStream | null): void {
    this.screenStream = stream;
  }

  // determine if we should be the offerer based on lexicographic peer_id comparison
  shouldOffer(remotePeerId: string): boolean {
    if (!this.localPeerId) return false;
    return this.localPeerId < remotePeerId;
  }

  // create a new peer connection for a remote peer
  // accepts an optional localStream parameter (for new API), falls back to this.localStream
  createConnection(peerId: string, localStream?: MediaStream | null): RTCPeerConnection {
    // close any existing connection to this peer before creating a new one
    this.removeConnection(peerId);

    const pc = new RTCPeerConnection(this.rtcConfig);
    const peerState: PeerState = {
      pc,
      candidateBuffer: [],
      restartAttempts: 0,
      disconnectTimer: null,
    };
    this.peers.set(peerId, peerState);

    // add all local tracks to the new connection
    const stream = localStream ?? this.localStream;
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        pc.addTrack(track, this.screenStream);
      }
    }

    // wire up event handlers
    this.setupPeerEventHandlers(peerId, peerState);

    return pc;
  }

  private setupPeerEventHandlers(peerId: string, peerState: PeerState): void {
    const { pc } = peerState;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] ICE candidate for ${peerId}: ${event.candidate.type ?? 'null'} ${event.candidate.candidate.substring(0, 60)}...`);
        if (this.onIceCandidate) {
          this.onIceCandidate(peerId, event.candidate);
        }
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received from ${peerId}: kind=${event.track.kind}`);
      if (event.streams.length > 0 && this.onRemoteStream) {
        this.onRemoteStream(peerId, event.streams[0]);
      }
    };

    pc.onnegotiationneeded = async () => {
      console.log(`[WebRTC] Negotiation needed for ${peerId}`);
      if (this.onNegotiationNeeded) {
        // If using new API (config-based), auto-create offer and pass SDP
        if (this.config) {
          if (!this.shouldOffer(peerId)) {
            console.log(`[WebRTC] Skipping negotiation for ${peerId} (remote peer should offer)`);
            return;
          }
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.onNegotiationNeeded(peerId, offer);
          } catch (err) {
            console.error(`[WebRTC] Failed to create offer during negotiation for ${peerId}:`, err);
          }
        } else {
          // Legacy API: just notify the caller (voice store handles offer creation)
          this.onNegotiationNeeded(peerId);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] Connection state for ${peerId}: ${state}`);

      // Fire per-peer connection state callback
      if (this.onPeerConnectionStateChanged) {
        this.onPeerConnectionStateChanged(peerId, state);
      }

      if (state === 'failed' || state === 'closed') {
        if (this.onRemoteStreamRemoved) {
          this.onRemoteStreamRemoved(peerId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log(`[WebRTC] ICE connection state for ${peerId}: ${iceState}`);

      if (iceState === 'disconnected') {
        // Start a timeout — if still disconnected after DISCONNECT_TIMEOUT_MS, attempt restart
        this.clearDisconnectTimer(peerState);
        peerState.disconnectTimer = setTimeout(() => {
          peerState.disconnectTimer = null;
          if (pc.iceConnectionState === 'disconnected') {
            console.log(`[WebRTC] Peer ${peerId} still disconnected after timeout, attempting ICE restart`);
            this.attemptIceRestart(peerId, peerState);
          }
        }, DISCONNECT_TIMEOUT_MS);
      } else if (iceState === 'failed') {
        // Immediately attempt ICE restart
        this.clearDisconnectTimer(peerState);
        console.log(`[WebRTC] ICE failed for ${peerId}, attempting ICE restart`);
        this.attemptIceRestart(peerId, peerState);
      } else if (iceState === 'connected' || iceState === 'completed') {
        // Connection recovered — reset restart counter and clear timers
        this.clearDisconnectTimer(peerState);
        peerState.restartAttempts = 0;
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state for ${peerId}: ${pc.iceGatheringState}`);
    };
  }

  private clearDisconnectTimer(peerState: PeerState): void {
    if (peerState.disconnectTimer !== null) {
      clearTimeout(peerState.disconnectTimer);
      peerState.disconnectTimer = null;
    }
  }

  private async attemptIceRestart(peerId: string, peerState: PeerState): Promise<void> {
    if (peerState.restartAttempts >= MAX_ICE_RESTART_ATTEMPTS) {
      console.error(`[WebRTC] Max ICE restart attempts (${MAX_ICE_RESTART_ATTEMPTS}) reached for ${peerId}, giving up`);
      if (this.onRemoteStreamRemoved) {
        this.onRemoteStreamRemoved(peerId);
      }
      if (this.onPeerConnectionStateChanged) {
        this.onPeerConnectionStateChanged(peerId, 'failed');
      }
      return;
    }

    peerState.restartAttempts++;
    console.log(`[WebRTC] ICE restart attempt ${peerState.restartAttempts}/${MAX_ICE_RESTART_ATTEMPTS} for ${peerId}`);

    try {
      const offer = await peerState.pc.createOffer({ iceRestart: true });
      await peerState.pc.setLocalDescription(offer);

      if (this.onNegotiationNeeded) {
        this.onNegotiationNeeded(peerId, offer);
      }
    } catch (err) {
      console.error(`[WebRTC] Failed ICE restart for ${peerId}:`, err);
    }
  }

  /** Flush buffered ICE candidates after remote description is set */
  private async flushCandidateBuffer(peerId: string, peerState: PeerState): Promise<void> {
    if (peerState.candidateBuffer.length === 0) return;

    console.log(`[WebRTC] Flushing ${peerState.candidateBuffer.length} buffered ICE candidates for ${peerId}`);
    const buffered = peerState.candidateBuffer.splice(0);

    for (const candidate of buffered) {
      try {
        await peerState.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error(`[WebRTC] Failed to add buffered ICE candidate for ${peerId}:`, err);
      }
    }
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new Error(`[WebRTC] No connection for peer ${peerId}`);
    }

    try {
      const offer = await peerState.pc.createOffer();
      await peerState.pc.setLocalDescription(offer);
      console.log(`[WebRTC] Created offer for ${peerId}`);
      return offer;
    } catch (err) {
      console.error(`[WebRTC] Failed to create offer for ${peerId}:`, err);
      throw err;
    }
  }

  // handleOffer replaces createAnswer — sets remote description, creates answer, flushes candidates
  async handleOffer(
    peerId: string,
    sdp: RTCSessionDescriptionInit,
    localStream?: MediaStream | null,
  ): Promise<RTCSessionDescriptionInit> {
    let peerState = this.peers.get(peerId);
    if (!peerState) {
      // Auto-create connection if it doesn't exist
      this.createConnection(peerId, localStream);
      peerState = this.peers.get(peerId)!;
    }

    try {
      await peerState.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[WebRTC] Set remote offer for ${peerId}`);

      // Flush any buffered ICE candidates now that remote description is set
      await this.flushCandidateBuffer(peerId, peerState);

      const answer = await peerState.pc.createAnswer();
      await peerState.pc.setLocalDescription(answer);
      console.log(`[WebRTC] Created answer for ${peerId}`);
      return answer;
    } catch (err) {
      console.error(`[WebRTC] Failed to handle offer from ${peerId}:`, err);
      throw err;
    }
  }

  // Legacy alias for handleOffer (backward compat with voice store)
  async createAnswer(
    peerId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    return this.handleOffer(peerId, offer);
  }

  // handleAnswer replaces setRemoteAnswer — sets remote description and flushes candidates
  async handleAnswer(
    peerId: string,
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new Error(`[WebRTC] No connection for peer ${peerId}`);
    }

    try {
      await peerState.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[WebRTC] Set remote answer for ${peerId}`);

      // Flush any buffered ICE candidates now that remote description is set
      await this.flushCandidateBuffer(peerId, peerState);
    } catch (err) {
      console.error(`[WebRTC] Failed to handle answer from ${peerId}:`, err);
      throw err;
    }
  }

  // Legacy alias for handleAnswer (backward compat with voice store)
  async setRemoteAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    return this.handleAnswer(peerId, answer);
  }

  async addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      // Candidate arrived before connection was created — buffer it in a temporary queue
      // that will be checked when the connection is created. For now, log and drop.
      console.warn(`[WebRTC] ICE candidate arrived for unknown peer ${peerId}, ignoring`);
      return;
    }

    // If remote description is not yet set, buffer the candidate
    if (!peerState.pc.remoteDescription) {
      console.log(`[WebRTC] Buffering ICE candidate for ${peerId} (no remote description yet)`);
      peerState.candidateBuffer.push(candidate);
      return;
    }

    try {
      await peerState.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // ICE candidates can arrive out of order or for stale connections
      console.error(`[WebRTC] Failed to add ICE candidate for ${peerId}:`, err);
    }
  }

  /** Perform an ICE restart for a specific peer. Returns new offer SDP or null on failure. */
  async restartIce(peerId: string): Promise<RTCSessionDescriptionInit | null> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      console.error(`[WebRTC] Cannot restart ICE: no connection for peer ${peerId}`);
      return null;
    }

    try {
      peerState.restartAttempts++;
      console.log(`[WebRTC] Manual ICE restart for ${peerId} (attempt ${peerState.restartAttempts})`);
      const offer = await peerState.pc.createOffer({ iceRestart: true });
      await peerState.pc.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error(`[WebRTC] Failed manual ICE restart for ${peerId}:`, err);
      return null;
    }
  }

  /** Get the current connection state for a specific peer */
  getPeerState(peerId: string): RTCPeerConnectionState | undefined {
    const peerState = this.peers.get(peerId);
    return peerState?.pc.connectionState;
  }

  // replaces tracks on all existing connections
  // overloaded: can be called with no args (legacy) or with (stream, kind) (new API)
  updateTracks(stream?: MediaStream | null, kind?: 'audio' | 'video'): void {
    for (const [, peerState] of this.peers) {
      const { pc } = peerState;
      const senders = pc.getSenders();

      // build the set of tracks we want active on each connection
      const desiredTracks: MediaStreamTrack[] = [];
      if (this.localStream) {
        desiredTracks.push(...this.localStream.getTracks());
      }
      if (this.screenStream) {
        desiredTracks.push(...this.screenStream.getTracks());
      }

      // If called with specific stream and kind, handle targeted update
      if (stream && kind) {
        const newTracks = stream.getTracks().filter((t) => t.kind === kind);
        for (const track of newTracks) {
          if (!desiredTracks.some((t) => t.id === track.id)) {
            desiredTracks.push(track);
          }
        }
      }

      // replace or add tracks that should be present
      for (const track of desiredTracks) {
        const existingSender = senders.find(
          (s) => s.track?.kind === track.kind && s.track?.id === track.id,
        );
        if (!existingSender) {
          // check if there is a sender with the same kind we can replace
          const kindSender = senders.find(
            (s) => s.track?.kind === track.kind || (s.track === null && track.kind !== undefined),
          );
          if (kindSender) {
            kindSender.replaceTrack(track).catch((err) => {
              console.error('[WebRTC] Failed to replace track:', err);
            });
          } else {
            // no existing sender for this kind, add a new one
            const parentStream =
              track.kind === 'video' && this.screenStream?.getVideoTracks().includes(track)
                ? this.screenStream
                : this.localStream;
            if (parentStream) {
              pc.addTrack(track, parentStream);
            }
          }
        }
      }

      // remove senders whose tracks are no longer desired
      const desiredTrackIds = new Set(desiredTracks.map((t) => t.id));
      for (const sender of senders) {
        if (sender.track && !desiredTrackIds.has(sender.track.id)) {
          try {
            pc.removeTrack(sender);
          } catch (err) {
            console.error('[WebRTC] Failed to remove track:', err);
          }
        }
      }
    }
  }

  // removeConnection (also aliased as closeConnection for backward compat)
  removeConnection(peerId: string): void {
    const peerState = this.peers.get(peerId);
    if (peerState) {
      this.clearDisconnectTimer(peerState);
      const { pc } = peerState;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.close();
      this.peers.delete(peerId);
    }
  }

  // Legacy alias for removeConnection (backward compat with voice store)
  closeConnection(peerId: string): void {
    this.removeConnection(peerId);
  }

  closeAll(): void {
    for (const [peerId] of this.peers) {
      this.removeConnection(peerId);
    }
    this.peers.clear();
    this.localStream = null;
    this.screenStream = null;
  }

  getConnection(peerId: string): RTCPeerConnection | undefined {
    return this.peers.get(peerId)?.pc;
  }
}
