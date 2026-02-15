// webrtc peer connection manager for voice/video calls
// manages one RTCPeerConnection per remote peer in a full mesh topology
// this is a utility module with no signals - the voice store drives it

// no external stun/turn servers for now, rely on host candidates only
// this works for LAN peers and peers on the same network segment
const rtcConfig: RTCConfiguration = {
  iceServers: [],
};

export class PeerConnectionManager {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  // the local peer id, used for glare resolution during simultaneous offers
  private localPeerId: string | null = null;

  // callbacks set by the voice store to bridge webrtc events into reactive state
  onRemoteStream: ((peerId: string, stream: MediaStream) => void) | null = null;
  onRemoteStreamRemoved: ((peerId: string) => void) | null = null;
  onIceCandidate: ((peerId: string, candidate: RTCIceCandidate) => void) | null = null;
  onNegotiationNeeded: ((peerId: string) => void) | null = null;

  setLocalPeerId(peerId: string): void {
    this.localPeerId = peerId;
  }

  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;
  }

  setScreenStream(stream: MediaStream | null): void {
    this.screenStream = stream;
  }

  // create a new peer connection for a remote peer
  // uses lexicographic peer_id comparison for glare resolution:
  // the peer with the smaller id is always the offerer
  createConnection(peerId: string): RTCPeerConnection {
    // close any existing connection to this peer before creating a new one
    this.closeConnection(peerId);

    const pc = new RTCPeerConnection(rtcConfig);
    this.connections.set(peerId, pc);

    // add all local tracks to the new connection
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        pc.addTrack(track, this.screenStream);
      }
    }

    // wire up event handlers
    pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(peerId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (event.streams.length > 0 && this.onRemoteStream) {
        this.onRemoteStream(peerId, event.streams[0]);
      }
    };

    pc.onnegotiationneeded = () => {
      if (this.onNegotiationNeeded) {
        this.onNegotiationNeeded(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (this.onRemoteStreamRemoved) {
          this.onRemoteStreamRemoved(peerId);
        }
      }
    };

    return pc;
  }

  // determine if we should be the offerer based on lexicographic peer_id comparison
  shouldOffer(remotePeerId: string): boolean {
    if (!this.localPeerId) return false;
    return this.localPeerId < remotePeerId;
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.connections.get(peerId);
    if (!pc) {
      throw new Error(`no connection for peer ${peerId}`);
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error(`failed to create offer for peer ${peerId}:`, err);
      throw err;
    }
  }

  async createAnswer(
    peerId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    const pc = this.connections.get(peerId);
    if (!pc) {
      throw new Error(`no connection for peer ${peerId}`);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    } catch (err) {
      console.error(`failed to create answer for peer ${peerId}:`, err);
      throw err;
    }
  }

  async setRemoteAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const pc = this.connections.get(peerId);
    if (!pc) {
      throw new Error(`no connection for peer ${peerId}`);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error(`failed to set remote answer for peer ${peerId}:`, err);
      throw err;
    }
  }

  async addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const pc = this.connections.get(peerId);
    if (!pc) {
      // candidate arrived before connection was created, safe to ignore
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // ice candidates can arrive out of order or for stale connections
      console.error(`failed to add ice candidate for peer ${peerId}:`, err);
    }
  }

  closeConnection(peerId: string): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.close();
      this.connections.delete(peerId);
    }
  }

  closeAll(): void {
    for (const [peerId] of this.connections) {
      this.closeConnection(peerId);
    }
    this.connections.clear();
    this.localStream = null;
    this.screenStream = null;
  }

  getConnection(peerId: string): RTCPeerConnection | undefined {
    return this.connections.get(peerId);
  }

  // replaces tracks on all existing connections
  // used when toggling video or screen share mid-call
  updateTracks(): void {
    for (const [, pc] of this.connections) {
      const senders = pc.getSenders();

      // build the set of tracks we want active on each connection
      const desiredTracks: MediaStreamTrack[] = [];
      if (this.localStream) {
        desiredTracks.push(...this.localStream.getTracks());
      }
      if (this.screenStream) {
        desiredTracks.push(...this.screenStream.getTracks());
      }

      // replace or add tracks that should be present
      for (const track of desiredTracks) {
        const existingSender = senders.find(
          (s) => s.track?.kind === track.kind && s.track?.id === track.id,
        );
        if (!existingSender) {
          // check if there is a sender with the same kind we can replace
          const kindSender = senders.find(
            (s) => s.track?.kind === track.kind || (!s.track && true),
          );
          if (kindSender) {
            kindSender.replaceTrack(track).catch((err) => {
              console.error("failed to replace track:", err);
            });
          } else {
            // no existing sender for this kind, add a new one
            const stream = track.kind === "video" && this.screenStream?.getVideoTracks().includes(track)
              ? this.screenStream
              : this.localStream;
            if (stream) {
              pc.addTrack(track, stream);
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
            console.error("failed to remove track:", err);
          }
        }
      }
    }
  }
}
