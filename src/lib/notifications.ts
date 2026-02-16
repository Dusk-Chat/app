import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSendNotification,
} from "@tauri-apps/plugin-notification";
import { settings } from "../stores/settings";
import type { ChatMessage } from "./types";

// track if we have notification permission
let permissionGranted = false;

// check and request notification permission on module load
export async function initNotifications(): Promise<boolean> {
  try {
    // check if already granted
    const granted = await isPermissionGranted();
    if (granted) {
      permissionGranted = true;
      return true;
    }

    // request permission
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
    return permissionGranted;
  } catch (error) {
    console.error("failed to initialize notifications:", error);
    return false;
  }
}

// send a desktop notification if settings allow
export async function sendNotification(title: string, body: string): Promise<void> {
  // check if notifications are enabled in settings
  const currentSettings = settings();
  if (!currentSettings.enable_desktop_notifications) {
    return;
  }

  // check permission
  if (!permissionGranted) {
    const granted = await initNotifications();
    if (!granted) {
      return;
    }
  }

  try {
    tauriSendNotification({ title, body });
  } catch (error) {
    console.error("failed to send notification:", error);
  }
}

// send notification for a channel message
export async function notifyChannelMessage(
  message: ChatMessage,
  channelName: string,
  communityName: string,
): Promise<void> {
  const currentSettings = settings();

  // dont notify if previews are disabled
  if (!currentSettings.enable_message_preview) {
    // send notification without message content
    await sendNotification(
      `${message.author_name} in ${communityName} > ${channelName}`,
      "New message",
    );
    return;
  }

  await sendNotification(
    `${message.author_name} in ${communityName} > ${channelName}`,
    message.content,
  );
}

// send notification for a direct message
export async function notifyDirectMessage(message: ChatMessage): Promise<void> {
  const currentSettings = settings();

  if (!currentSettings.enable_message_preview) {
    await sendNotification(`${message.author_name}`, "Sent you a message");
    return;
  }

  await sendNotification(`${message.author_name}`, message.content);
}

// check if the window is focused
export function isWindowFocused(): boolean {
  return document.hasFocus();
}
