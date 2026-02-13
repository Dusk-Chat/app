// format a unix timestamp (ms) into a human-readable time string
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;

  return `${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  })} at ${time}`;
}

// format a timestamp into just the time portion for grouped messages
export function formatTimeShort(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// check if two timestamps are within the same grouping window (5 minutes)
export function isWithinGroupWindow(
  timestamp1: number,
  timestamp2: number,
): boolean {
  return Math.abs(timestamp1 - timestamp2) < 5 * 60 * 1000;
}

// check if two dates are on different calendar days
export function isDifferentDay(
  timestamp1: number,
  timestamp2: number,
): boolean {
  const d1 = new Date(timestamp1);
  const d2 = new Date(timestamp2);
  return d1.toDateString() !== d2.toDateString();
}

// format a date for the day separator between messages
export function formatDaySeparator(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// get initials from a display name (first two characters, uppercase)
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// generate a deterministic color from a string (for avatar backgrounds)
export function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 50%, 35%)`;
}
