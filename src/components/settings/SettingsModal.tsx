import { Component, createSignal, createEffect, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  X,
  User,
  Bell,
  Eye,
  Palette,
  Info,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-solid";
import {
  settings,
  updateDisplayName,
  updateStatus,
  updateStatusMessage,
  toggleSounds,
  toggleDesktopNotifications,
  toggleMessagePreview,
  toggleShowOnlineStatus,
  toggleAllowDMsFromAnyone,
  setMessageDisplay,
  setFontSize,
} from "../../stores/settings";
import { identity, updateIdentity } from "../../stores/identity";
import { updateProfile } from "../../lib/tauri";
import type { UserStatus } from "../../lib/types";
import Avatar from "../common/Avatar";
import Button from "../common/Button";

type SettingsSection =
  | "profile"
  | "notifications"
  | "privacy"
  | "appearance"
  | "about";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onResetIdentity: () => void;
}

const statusOptions: { value: UserStatus; label: string; color: string }[] = [
  { value: "online", label: "online", color: "bg-green-500" },
  { value: "idle", label: "idle", color: "bg-yellow-500" },
  { value: "dnd", label: "do not disturb", color: "bg-red-500" },
  { value: "invisible", label: "invisible", color: "bg-gray-500" },
];

const SettingsModal: Component<SettingsModalProps> = (props) => {
  const [activeSection, setActiveSection] =
    createSignal<SettingsSection>("profile");
  const [localDisplayName, setLocalDisplayName] = createSignal(
    settings().display_name,
  );
  const [localStatusMessage, setLocalStatusMessage] = createSignal(
    settings().status_message,
  );
  const [localBio, setLocalBio] = createSignal(identity()?.bio || "");
  const [copied, setCopied] = createSignal(false);

  // sync local state when modal opens
  createEffect(() => {
    if (props.isOpen) {
      setLocalDisplayName(settings().display_name);
      setLocalStatusMessage(settings().status_message);
      setLocalBio(identity()?.bio || "");
    }
  });

  const sections: { id: SettingsSection; label: string; icon: typeof User }[] =
    [
      { id: "profile", label: "profile", icon: User },
      { id: "notifications", label: "notifications", icon: Bell },
      { id: "privacy", label: "privacy", icon: Eye },
      { id: "appearance", label: "appearance", icon: Palette },
      { id: "about", label: "about", icon: Info },
    ];

  async function handleSave() {
    const name = localDisplayName();
    const bio = localBio();

    // apply local state to store
    updateDisplayName(name);
    updateStatusMessage(localStatusMessage());
    updateIdentity({ display_name: name, bio });

    // persist profile changes to backend
    try {
      await updateProfile(name, bio);
    } catch (e) {
      console.error("failed to update profile:", e);
    }

    props.onSave();
  }

  function copyPeerId() {
    const id = identity();
    if (id?.peer_id) {
      navigator.clipboard.writeText(id.peer_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 animate-fade-in">
          <div class="bg-gray-900 border-2 border-white/20 w-full max-w-[800px] h-[600px] mx-4 animate-scale-in flex overflow-hidden">
            {/* sidebar navigation */}
            <div class="w-[200px] shrink-0 bg-black border-r border-white/10 flex flex-col">
              <div class="p-4 border-b border-white/10">
                <h2 class="text-[14px] font-mono uppercase tracking-[0.05em] text-white/60">
                  settings
                </h2>
              </div>
              <nav class="flex-1 py-2">
                <For each={sections}>
                  {(section) => (
                    <button
                      type="button"
                      class={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-200 cursor-pointer ${
                        activeSection() === section.id
                          ? "bg-gray-800 text-orange border-l-4 border-orange"
                          : "text-white/60 hover:text-white hover:bg-gray-800/50 border-l-4 border-transparent"
                      }`}
                      onClick={() => setActiveSection(section.id)}
                    >
                      <section.icon size={18} />
                      <span class="text-[14px] font-medium">
                        {section.label}
                      </span>
                    </button>
                  )}
                </For>
              </nav>
            </div>

            {/* main content */}
            <div class="flex-1 flex flex-col">
              {/* header */}
              <div class="flex items-center justify-between p-4 border-b border-white/10">
                <h3 class="text-[20px] font-bold text-white capitalize">
                  {activeSection()}
                </h3>
                <button
                  type="button"
                  class="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors duration-200 cursor-pointer"
                  onClick={props.onClose}
                >
                  <X size={20} />
                </button>
              </div>

              {/* content */}
              <div class="flex-1 overflow-y-auto p-6">
                <Show when={activeSection() === "profile"}>
                  <ProfileSection
                    displayName={localDisplayName()}
                    onDisplayNameChange={setLocalDisplayName}
                    statusMessage={localStatusMessage()}
                    onStatusMessageChange={setLocalStatusMessage}
                    bio={localBio()}
                    onBioChange={setLocalBio}
                  />
                </Show>

                <Show when={activeSection() === "notifications"}>
                  <NotificationsSection />
                </Show>

                <Show when={activeSection() === "privacy"}>
                  <PrivacySection
                    onResetIdentity={props.onResetIdentity}
                    onClose={props.onClose}
                  />
                </Show>

                <Show when={activeSection() === "appearance"}>
                  <AppearanceSection />
                </Show>

                <Show when={activeSection() === "about"}>
                  <AboutSection copied={copied()} onCopyPeerId={copyPeerId} />
                </Show>
              </div>

              {/* footer */}
              <div class="p-4 border-t border-white/10 flex justify-end gap-3">
                <Button variant="ghost" onClick={props.onClose}>
                  cancel
                </Button>
                <Button variant="primary" onClick={handleSave}>
                  save changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

// profile section component
interface ProfileSectionProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  statusMessage: string;
  onStatusMessageChange: (msg: string) => void;
  bio: string;
  onBioChange: (bio: string) => void;
}

const ProfileSection: Component<ProfileSectionProps> = (props) => {
  const currentStatus = () => settings().status;

  return (
    <div class="space-y-6">
      {/* avatar preview */}
      <div class="flex items-center gap-4 p-4 bg-black/50 border border-white/10">
        <Avatar
          name={props.displayName || "user"}
          size="lg"
          status="Online"
          showStatus
        />
        <div>
          <p class="text-[16px] font-medium text-white">
            {props.displayName || "anonymous"}
          </p>
          <p class="text-[12px] font-mono text-white/40">
            {props.bio
              ? props.bio.slice(0, 30) + (props.bio.length > 30 ? "..." : "")
              : currentStatus()}
          </p>
        </div>
      </div>

      {/* display name */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          display name
        </label>
        <input
          type="text"
          class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
          placeholder="your display name"
          value={props.displayName}
          onInput={(e) => props.onDisplayNameChange(e.currentTarget.value)}
          maxLength={32}
        />
        <p class="mt-1 text-[11px] font-mono text-white/30">
          {props.displayName.length}/32 characters
        </p>
      </div>

      {/* bio */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          bio
        </label>
        <textarea
          class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200 resize-none h-24"
          placeholder="tell us about yourself"
          value={props.bio}
          onInput={(e) => props.onBioChange(e.currentTarget.value)}
          maxLength={160}
        />
        <p class="mt-1 text-[11px] font-mono text-white/30">
          {props.bio.length}/160 characters
        </p>
      </div>

      {/* status */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          status
        </label>
        <div class="flex gap-2">
          <For each={statusOptions}>
            {(option) => (
              <button
                type="button"
                class={`flex items-center gap-2 px-4 py-2 border-2 transition-all duration-200 cursor-pointer ${
                  currentStatus() === option.value
                    ? "border-orange bg-orange/10 text-white"
                    : "border-white/20 text-white/60 hover:border-white/40 hover:text-white"
                }`}
                onClick={() => updateStatus(option.value)}
              >
                <span class={`w-2 h-2 rounded-full ${option.color}`} />
                <span class="text-[13px] font-medium">{option.label}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* status message */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          status message
        </label>
        <input
          type="text"
          class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
          placeholder="what are you up to?"
          value={props.statusMessage}
          onInput={(e) => props.onStatusMessageChange(e.currentTarget.value)}
          maxLength={128}
        />
      </div>
    </div>
  );
};

// notifications section component
const NotificationsSection: Component = () => {
  const current = () => settings();

  return (
    <div class="space-y-4">
      <ToggleRow
        label="sounds"
        description="play sounds for new messages and events"
        checked={current().enable_sounds}
        onChange={toggleSounds}
      />
      <ToggleRow
        label="desktop notifications"
        description="show system notifications for new messages"
        checked={current().enable_desktop_notifications}
        onChange={toggleDesktopNotifications}
      />
      <ToggleRow
        label="message preview"
        description="show message content in notifications"
        checked={current().enable_message_preview}
        onChange={toggleMessagePreview}
      />
    </div>
  );
};

// privacy section component
const PrivacySection: Component<{
  onResetIdentity: () => void;
  onClose: () => void;
}> = (props) => {
  const current = () => settings();
  const [confirmingReset, setConfirmingReset] = createSignal(false);
  const [confirmText, setConfirmText] = createSignal("");

  function handleReset() {
    props.onClose();
    props.onResetIdentity();
  }

  return (
    <div class="space-y-4">
      <ToggleRow
        label="show online status"
        description="let others see when you're online"
        checked={current().show_online_status}
        onChange={toggleShowOnlineStatus}
      />
      <ToggleRow
        label="allow dms from anyone"
        description="receive direct messages from people not in your communities"
        checked={current().allow_dms_from_anyone}
        onChange={toggleAllowDMsFromAnyone}
      />

      {/* danger zone */}
      <div class="mt-8 pt-6 border-t border-red-500/20">
        <div class="flex items-center gap-2 mb-4">
          <AlertTriangle size={16} class="text-red-500" />
          <h4 class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-red-500">
            danger zone
          </h4>
        </div>

        <Show
          when={confirmingReset()}
          fallback={
            <div class="p-4 bg-black/50 border border-red-500/20">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-[14px] font-medium text-white">
                    reset identity
                  </p>
                  <p class="text-[12px] text-white/50 mt-1">
                    permanently destroy your keypair, wipe all local data, and
                    broadcast a revocation to all connected peers
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingReset(true)}
                >
                  <span class="text-red-500">reset</span>
                </Button>
              </div>
            </div>
          }
        >
          <div class="p-4 bg-red-500/5 border-2 border-red-500/40 space-y-4">
            <p class="text-[14px] text-white">
              this action is{" "}
              <span class="font-bold text-red-500">irreversible</span>. your
              identity keypair will be destroyed and all peers will be notified
              to remove your profile from their directories.
            </p>
            <p class="text-[13px] text-white/60">
              type <span class="font-mono text-red-400">RESET</span> to confirm
            </p>
            <input
              type="text"
              class="w-full bg-black border-2 border-red-500/30 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/20 focus:border-red-500 transition-colors duration-200"
              placeholder="type RESET to confirm"
              value={confirmText()}
              onInput={(e) => setConfirmText(e.currentTarget.value)}
            />
            <div class="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmingReset(false);
                  setConfirmText("");
                }}
              >
                cancel
              </Button>
              <button
                type="button"
                disabled={confirmText() !== "RESET"}
                class={`px-6 py-2 text-[14px] font-medium border-2 transition-all duration-200 ${
                  confirmText() === "RESET"
                    ? "bg-red-500 border-red-500 text-white cursor-pointer hover:bg-red-600"
                    : "bg-gray-800 border-white/10 text-white/30 cursor-not-allowed"
                }`}
                onClick={handleReset}
              >
                destroy identity
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

// appearance section component
const AppearanceSection: Component = () => {
  const current = () => settings();

  return (
    <div class="space-y-6">
      {/* message display */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-3">
          message display
        </label>
        <div class="flex gap-3">
          <button
            type="button"
            class={`flex-1 p-4 border-2 transition-all duration-200 cursor-pointer ${
              current().message_display === "cozy"
                ? "border-orange bg-orange/10"
                : "border-white/20 hover:border-white/40"
            }`}
            onClick={() => setMessageDisplay("cozy")}
          >
            <p class="text-[14px] font-medium text-white mb-1">cozy</p>
            <p class="text-[12px] text-white/50">
              larger avatars, more spacing
            </p>
          </button>
          <button
            type="button"
            class={`flex-1 p-4 border-2 transition-all duration-200 cursor-pointer ${
              current().message_display === "compact"
                ? "border-orange bg-orange/10"
                : "border-white/20 hover:border-white/40"
            }`}
            onClick={() => setMessageDisplay("compact")}
          >
            <p class="text-[14px] font-medium text-white mb-1">compact</p>
            <p class="text-[12px] text-white/50">
              smaller elements, dense layout
            </p>
          </button>
        </div>
      </div>

      {/* font size */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-3">
          font size
        </label>
        <div class="flex gap-2">
          {(["small", "default", "large"] as const).map((size) => (
            <button
              type="button"
              class={`px-6 py-2 border-2 transition-all duration-200 cursor-pointer ${
                current().font_size === size
                  ? "border-orange bg-orange/10 text-white"
                  : "border-white/20 text-white/60 hover:border-white/40 hover:text-white"
              }`}
              onClick={() => setFontSize(size)}
            >
              <span
                class={`font-medium ${size === "small" ? "text-[12px]" : size === "large" ? "text-[18px]" : "text-[14px]"}`}
              >
                {size}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// about section component
interface AboutSectionProps {
  copied: boolean;
  onCopyPeerId: () => void;
}

const AboutSection: Component<AboutSectionProps> = (props) => {
  const id = () => identity();

  return (
    <div class="space-y-6">
      {/* peer id */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          peer id
        </label>
        <div class="flex items-center gap-2">
          <div class="flex-1 bg-black border-2 border-white/20 px-4 py-3 font-mono text-[13px] text-white/70 truncate">
            {id()?.peer_id || "not available"}
          </div>
          <button
            type="button"
            class="p-3 bg-gray-800 border-2 border-white/20 hover:border-white/40 transition-colors duration-200 cursor-pointer"
            onClick={props.onCopyPeerId}
          >
            <Show
              when={props.copied}
              fallback={<Copy size={18} class="text-white/60" />}
            >
              <Check size={18} class="text-green-500" />
            </Show>
          </button>
        </div>
        <p class="mt-1 text-[11px] font-mono text-white/30">
          your unique identifier on the network
        </p>
      </div>

      {/* public key */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          public key
        </label>
        <div class="bg-black border-2 border-white/20 px-4 py-3 font-mono text-[11px] text-white/50 break-all">
          {id()?.public_key || "not available"}
        </div>
      </div>

      {/* version info */}
      <div class="pt-4 border-t border-white/10">
        <div class="flex justify-between items-center">
          <span class="text-[12px] font-mono text-white/40">version</span>
          <span class="text-[12px] font-mono text-white/60">0.1.0-dev</span>
        </div>
        <div class="flex justify-between items-center mt-2">
          <span class="text-[12px] font-mono text-white/40">protocol</span>
          <span class="text-[12px] font-mono text-white/60">dusk/1.0</span>
        </div>
      </div>
    </div>
  );
};

// reusable toggle row component
interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

const ToggleRow: Component<ToggleRowProps> = (props) => {
  return (
    <div
      class="flex items-center justify-between p-4 bg-black/50 border border-white/10 cursor-pointer hover:border-white/20 transition-colors duration-200"
      onClick={props.onChange}
    >
      <div>
        <p class="text-[14px] font-medium text-white">{props.label}</p>
        <p class="text-[12px] text-white/50">{props.description}</p>
      </div>
      <div
        class={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ${
          props.checked ? "bg-orange" : "bg-gray-700"
        }`}
      >
        <div
          class={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
            props.checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </div>
    </div>
  );
};

export default SettingsModal;
