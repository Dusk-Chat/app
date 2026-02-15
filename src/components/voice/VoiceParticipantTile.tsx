import type { Component } from "solid-js";
import { Show, createEffect, onCleanup } from "solid-js";
import { MicOff, VolumeX } from "lucide-solid";
import Avatar from "../common/Avatar";
import { openProfileCard } from "../../stores/ui";
import type { VoiceMediaState } from "../../lib/types";

interface VoiceParticipantTileProps {
  peer_id: string;
  display_name: string;
  media_state: VoiceMediaState;
  stream?: MediaStream | null;
  is_local?: boolean;
}

const VoiceParticipantTile: Component<VoiceParticipantTileProps> = (props) => {
  let videoRef: HTMLVideoElement | undefined;

  // attach stream to video element when it changes
  createEffect(() => {
    const currentStream = props.stream;
    if (videoRef && currentStream) {
      videoRef.srcObject = currentStream;
    }
  });

  // cleanup video element on unmount
  onCleanup(() => {
    if (videoRef) {
      videoRef.srcObject = null;
    }
  });

  const hasVideo = () => {
    return (
      props.stream &&
      (props.media_state.video_enabled || props.media_state.screen_sharing)
    );
  };

  return (
    <div
      class="relative bg-black border border-white/10 aspect-video flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={(e) => {
        openProfileCard({
          peerId: props.peer_id,
          displayName: props.display_name,
          anchorX: e.clientX,
          anchorY: e.clientY,
        });
      }}
    >
      <Show
        when={hasVideo()}
        fallback={
          <div class="flex flex-col items-center justify-center gap-2 p-4">
            <Avatar name={props.display_name} size="xl" />
            <span class="text-white text-sm font-medium truncate max-w-full">
              {props.display_name}
            </span>
          </div>
        }
      >
        <video
          ref={videoRef}
          autoplay
          playsinline
          muted={props.is_local}
          class="w-full h-full object-cover"
        />
        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <span class="text-white text-sm font-medium truncate">
            {props.display_name}
          </span>
        </div>
      </Show>

      <Show when={props.media_state.muted}>
        <div class="absolute top-2 right-2 bg-black/80 p-1">
          <MicOff size={16} class="text-[#FF4F00]" />
        </div>
      </Show>

      <Show when={props.media_state.deafened}>
        <div class="absolute top-2 right-2 bg-black/80 p-1">
          <VolumeX size={16} class="text-[#FF4F00]" />
        </div>
      </Show>

      <Show when={props.is_local}>
        <div class="absolute top-2 left-2 bg-black/80 px-2 py-1">
          <span class="text-white/60 text-xs">You</span>
        </div>
      </Show>
    </div>
  );
};

export default VoiceParticipantTile;
