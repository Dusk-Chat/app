import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Mic, MicOff, Volume2, VolumeX, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from "lucide-solid";
import IconButton from "../common/IconButton";
import { localMediaState, toggleMute, toggleDeafen, toggleVideo, toggleScreenShare, leaveVoice } from "../../stores/voice";

interface VoiceControlsProps {
  onMuteToggle?: () => void;
  onDeafenToggle?: () => void;
  onVideoToggle?: () => void;
  onScreenShareToggle?: () => void;
  onLeave?: () => void;
}

const VoiceControls: Component<VoiceControlsProps> = (props) => {
  const handleMuteToggle = async () => {
    await toggleMute();
    props.onMuteToggle?.();
  };

  const handleDeafenToggle = async () => {
    await toggleDeafen();
    props.onDeafenToggle?.();
  };

  const handleVideoToggle = async () => {
    await toggleVideo();
    props.onVideoToggle?.();
  };

  const handleScreenShareToggle = async () => {
    await toggleScreenShare();
    props.onScreenShareToggle?.();
  };

  const handleLeave = async () => {
    await leaveVoice();
    props.onLeave?.();
  };

  return (
    <div class="flex items-center justify-center gap-2 p-4 bg-black border-t border-white/10">
      <IconButton
        label={localMediaState().muted ? "Unmute" : "Mute"}
        size={40}
        active={localMediaState().muted}
        onClick={handleMuteToggle}
      >
        <Show when={localMediaState().muted} fallback={<Mic size={20} />}>
          <MicOff size={20} />
        </Show>
      </IconButton>

      <IconButton
        label={localMediaState().deafened ? "Undeafen" : "Deafen"}
        size={40}
        active={localMediaState().deafened}
        onClick={handleDeafenToggle}
      >
        <Show when={localMediaState().deafened} fallback={<Volume2 size={20} />}>
          <VolumeX size={20} />
        </Show>
      </IconButton>

      <IconButton
        label={localMediaState().video_enabled ? "Stop Video" : "Start Video"}
        size={40}
        active={localMediaState().video_enabled}
        onClick={handleVideoToggle}
      >
        <Show when={localMediaState().video_enabled} fallback={<Video size={20} />}>
          <VideoOff size={20} />
        </Show>
      </IconButton>

      <IconButton
        label={localMediaState().screen_sharing ? "Stop Screen Share" : "Start Screen Share"}
        size={40}
        active={localMediaState().screen_sharing}
        onClick={handleScreenShareToggle}
      >
        <Show when={localMediaState().screen_sharing} fallback={<Monitor size={20} />}>
          <MonitorOff size={20} />
        </Show>
      </IconButton>

      <IconButton
        label="Leave Voice Channel"
        size={40}
        onClick={handleLeave}
        class="bg-error hover:bg-red-600"
      >
        <PhoneOff size={20} />
      </IconButton>
    </div>
  );
};

export default VoiceControls;
