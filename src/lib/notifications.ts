import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSendNotification,
  registerActionTypes,
  onAction,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { settings } from "../stores/settings";
import { setActiveCommunity } from "../stores/communities";
import { setActiveChannel } from "../stores/channels";
import { setActiveDM } from "../stores/dms";
import { generateAvatarSvg, avatarCacheKey } from "./avatar-svg";
import { cacheAvatarIcon } from "./tauri";
import type { ChatMessage } from "./types";

// track if we have notification permission
let permissionGranted = false;

// avoid redundant disk writes for the same avatar
const iconPathCache = new Map<string, string>();

// action type id for clickable notifications
const NAVIGATE_ACTION_TYPE = "dusk-navigate";

// check and request notification permission on module load
export async function initNotifications(): Promise<boolean> {
  try {
    // check if already granted
    const granted = await isPermissionGranted();
    if (granted) {
      permissionGranted = true;
    } else {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }

    if (!permissionGranted) return false;

    // register action types so clicking a notification fires onAction
    await registerActionTypes([
      {
        id: NAVIGATE_ACTION_TYPE,
        actions: [
          {
            id: "default",
            title: "Open",
            foreground: true,
          },
        ],
      },
    ]);

    // handle notification clicks by navigating to the relevant screen
    await onAction((notification) => {
      const extra = notification.extra as
        | Record<string, unknown>
        | undefined;
      if (!extra) return;

      navigateToTarget(extra);
    });

    return true;
  } catch (error) {
    console.error("failed to initialize notifications:", error);
    return false;
  }
}

// navigate to the community/channel or dm referenced by the notification payload
async function navigateToTarget(extra: Record<string, unknown>) {
  const type = extra.type as string | undefined;

  try {
    // bring the window to focus
    await getCurrentWindow().setFocus();
    await getCurrentWindow().unminimize();
  } catch {
    // non-critical, window focus may not be supported in all environments
  }

  if (type === "channel") {
    const communityId = extra.community_id as string | undefined;
    const channelId = extra.channel_id as string | undefined;
    if (communityId) {
      setActiveCommunity(communityId);
      setActiveDM(null);
    }
    // channel selection happens after the community effect loads channels,
    // so defer it slightly to let the reactive chain settle
    if (channelId) {
      setTimeout(() => setActiveChannel(channelId), 50);
    }
  } else if (type === "dm") {
    const peerId = extra.peer_id as string | undefined;
    if (peerId) {
      // switch to home view and open the dm
      setActiveCommunity(null);
      setActiveDM(peerId);
    }
  }
}

// resolve the cached icon path for a given author name
// generates the svg and writes it to disk on first call per name
async function getIconPath(authorName: string): Promise<string | undefined> {
  const key = avatarCacheKey(authorName);

  // return from memory cache if we already resolved this name
  const cached = iconPathCache.get(key);
  if (cached) return cached;

  try {
    const svg = generateAvatarSvg(authorName);
    const path = await cacheAvatarIcon(key, svg);
    iconPathCache.set(key, path);
    return path;
  } catch {
    // non-critical, notification will just lack an icon
    return undefined;
  }
}

// send a desktop notification with optional navigation context
async function sendNotification(
  title: string,
  body: string,
  authorName?: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const currentSettings = settings();
  if (!currentSettings.enable_desktop_notifications) {
    return;
  }

  if (!permissionGranted) {
    const granted = await initNotifications();
    if (!granted) {
      return;
    }
  }

  try {
    const icon = authorName ? await getIconPath(authorName) : undefined;
    tauriSendNotification({
      title,
      body,
      icon,
      actionTypeId: NAVIGATE_ACTION_TYPE,
      extra,
    });
  } catch (error) {
    console.error("failed to send notification:", error);
  }
}

// send notification for a channel message
export async function notifyChannelMessage(
  message: ChatMessage,
  channelName: string,
  communityName: string,
  communityId: string,
): Promise<void> {
  const currentSettings = settings();
  const extra = {
    type: "channel",
    community_id: communityId,
    channel_id: message.channel_id,
  };

  if (!currentSettings.enable_message_preview) {
    await sendNotification(
      `${message.author_name} in ${communityName} > ${channelName}`,
      "New message",
      message.author_name,
      extra,
    );
    return;
  }

  await sendNotification(
    `${message.author_name} in ${communityName} > ${channelName}`,
    message.content,
    message.author_name,
    extra,
  );
}

// send notification when the current user is mentioned in a channel message
export async function notifyMention(
  message: ChatMessage,
  channelName: string,
  communityName: string,
  communityId: string,
): Promise<void> {
  const currentSettings = settings();
  const extra = {
    type: "channel",
    community_id: communityId,
    channel_id: message.channel_id,
  };

  if (!currentSettings.enable_message_preview) {
    await sendNotification(
      `${message.author_name} mentioned you in ${communityName} > ${channelName}`,
      "You were mentioned",
      message.author_name,
      extra,
    );
    return;
  }

  await sendNotification(
    `${message.author_name} mentioned you in ${communityName} > ${channelName}`,
    message.content,
    message.author_name,
    extra,
  );
}

// send notification for a direct message
export async function notifyDirectMessage(
  message: ChatMessage,
  peerId: string,
): Promise<void> {
  const currentSettings = settings();
  const extra = {
    type: "dm",
    peer_id: peerId,
  };

  if (!currentSettings.enable_message_preview) {
    await sendNotification(
      `${message.author_name}`,
      "Sent you a message",
      message.author_name,
      extra,
    );
    return;
  }

  await sendNotification(
    `${message.author_name}`,
    message.content,
    message.author_name,
    extra,
  );
}

// check if the window is focused
export function isWindowFocused(): boolean {
  return document.hasFocus();
}
