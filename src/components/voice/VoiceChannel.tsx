import type { Component } from "solid-js";
import { Show, For } from "solid-js";
import {
  voiceParticipants,
  localMediaState,
  localStream,
  remoteStreams,
  voiceConnectionState,
  voiceError,
  voiceQuality,
  peerConnectionStates,
  joinVoice,
} from "../../stores/voice";
import { identity } from "../../stores/identity";
import VoiceControls from "./VoiceControls";
import VoiceParticipantTile from "./VoiceParticipantTile";

interface VoiceChannelProps {
  communityId: string;
  channelId: string;
}

// standalone voice channel view for when video/screen share is active
// voice joining is handled by clicking the channel in the sidebar,
// not by mounting this component
const VoiceChannel: Component<VoiceChannelProps> = (props) => {
  // get local participant info
  const localPeerId = () => identity()?.peer_id;
  const localDisplayName = () => identity()?.display_name ?? "You";

  // build list of all participants including local user
  const allParticipants = () => {
    const participants = voiceParticipants();
    const localId = localPeerId();

    // filter out local user from remote participants list
    const remoteParticipants = participants.filter(
      (p) => p.peer_id !== localId,
    );

    // build local participant entry
    const localParticipant = {
      peer_id: localId ?? "local",
      display_name: localDisplayName(),
      media_state: localMediaState(),
      stream: localStream(),
      is_local: true,
    };

    // build remote participant entries with their streams
    const remoteEntries = remoteParticipants.map((p) => ({
      peer_id: p.peer_id,
      display_name: p.display_name,
      media_state: p.media_state,
      stream: remoteStreams().get(p.peer_id) ?? null,
      is_local: false,
    }));

    return [localParticipant, ...remoteEntries];
  };

  const participantCount = () => {
    return allParticipants().length;
  };

  // voice quality indicator config
  const qualityConfig = () => {
    const q = voiceQuality();
    switch (q) {
      case "good":
        return { color: "bg-green-500", text: "Connected" };
      case "connecting":
        return { color: "bg-amber-400 animate-pulse", text: "Connecting..." };
      case "degraded":
        return { color: "bg-orange-500", text: "Degraded" };
      case "failed":
        return { color: "bg-red-500", text: "Connection Failed" };
      default:
        return { color: "bg-white/40", text: "" };
    }
  };

  // look up per-peer connection state for a participant
  const getPeerState = (peerId: string, isLocal: boolean) => {
    if (isLocal) return "connected" as RTCPeerConnectionState;
    return peerConnectionStates()[peerId];
  };

  return (
    <div class="flex flex-col h-full bg-black">
      <div class="flex-1 overflow-auto p-4">
        <div class="mb-4">
          <div class="flex items-center gap-2">
            <h2 class="text-white text-lg font-semibold">Voice Channel</h2>
            <Show
              when={
                voiceConnectionState() === "connected" ||
                voiceConnectionState() === "degraded"
              }
            >
              <div class="flex items-center gap-1.5 ml-2">
                <span
                  class={`inline-block w-2 h-2 rounded-full ${qualityConfig().color}`}
                />
                <span class="text-white/50 text-xs">
                  {qualityConfig().text}
                </span>
              </div>
            </Show>
          </div>
          <p class="text-white/60 text-sm">
            {participantCount()} participant
            {participantCount() !== 1 ? "s" : ""}
          </p>
        </div>

        {/* error state */}
        <Show when={voiceConnectionState() === "error"}>
          <div class="flex flex-col items-center justify-center h-64 gap-4">
            <div class="text-white/60 text-center">
              <p class="text-sm text-red-400 mb-2">
                failed to connect to voice channel
              </p>
              <p class="text-xs text-white/40">{voiceError()}</p>
            </div>
            <button
              type="button"
              class="px-4 py-2 text-sm text-white/80 border border-white/20 hover:border-orange hover:text-white transition-colors duration-200 cursor-pointer"
              onClick={() => joinVoice(props.communityId, props.channelId)}
            >
              retry
            </button>
          </div>
        </Show>

        {/* connecting state */}
        <Show when={voiceConnectionState() === "connecting"}>
          <div class="flex items-center justify-center h-64">
            <div class="text-white/60 text-center">
              <p class="text-sm">connecting to voice channel...</p>
            </div>
          </div>
        </Show>

        {/* connected / degraded state with participants grid */}
        <Show
          when={
            voiceConnectionState() === "connected" ||
            voiceConnectionState() === "degraded"
          }
        >
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={allParticipants()}>
              {(participant) => (
                <VoiceParticipantTile
                  peer_id={participant.peer_id}
                  display_name={participant.display_name}
                  media_state={participant.media_state}
                  stream={participant.stream}
                  is_local={participant.is_local}
                  connectionState={getPeerState(
                    participant.peer_id,
                    participant.is_local,
                  )}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show
        when={
          voiceConnectionState() === "connected" ||
          voiceConnectionState() === "degraded"
        }
      >
        <VoiceControls />
      </Show>
    </div>
  );
};

export default VoiceChannel;
