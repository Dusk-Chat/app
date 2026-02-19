import { createSignal, createEffect } from "solid-js";
import type { UserSettings, UserStatus } from "../lib/types";

// default settings for new users
const defaultSettings: UserSettings = {
  display_name: "anonymous",
  status: "online",
  status_message: "",
  enable_sounds: true,
  enable_desktop_notifications: true,
  enable_message_preview: true,
  show_online_status: true,
  allow_dms_from_anyone: true,
  relay_discoverable: true,
  message_display: "cozy",
  font_size: "default",
};

const SETTINGS_KEY = "dusk_user_settings";

// load from local storage on init
function loadFromStorage(): UserSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return defaultSettings;
}

const [settings, setSettings] = createSignal<UserSettings>(loadFromStorage());

// persist to local storage on changes
createEffect(() => {
  const current = settings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
});

export function updateSettings(updates: Partial<UserSettings>) {
  setSettings((prev) => ({ ...prev, ...updates }));
}

export function updateDisplayName(name: string) {
  updateSettings({ display_name: name });
}

export function updateStatus(status: UserStatus) {
  updateSettings({ status });
}

export function updateStatusMessage(message: string) {
  updateSettings({ status_message: message });
}

export function toggleSounds() {
  setSettings((prev) => ({ ...prev, enable_sounds: !prev.enable_sounds }));
}

export function toggleDesktopNotifications() {
  setSettings((prev) => ({
    ...prev,
    enable_desktop_notifications: !prev.enable_desktop_notifications,
  }));
}

export function toggleMessagePreview() {
  setSettings((prev) => ({
    ...prev,
    enable_message_preview: !prev.enable_message_preview,
  }));
}

export function toggleShowOnlineStatus() {
  setSettings((prev) => ({
    ...prev,
    show_online_status: !prev.show_online_status,
  }));
}

export function toggleAllowDMsFromAnyone() {
  setSettings((prev) => ({
    ...prev,
    allow_dms_from_anyone: !prev.allow_dms_from_anyone,
  }));
}

export function toggleRelayDiscoverable() {
  setSettings((prev) => ({
    ...prev,
    relay_discoverable: !prev.relay_discoverable,
  }));
}

export function setMessageDisplay(mode: "cozy" | "compact") {
  updateSettings({ message_display: mode });
}

export function setFontSize(size: "small" | "default" | "large") {
  updateSettings({ font_size: size });
}

export function resetSettings() {
  setSettings(defaultSettings);
}

export { settings, defaultSettings };
