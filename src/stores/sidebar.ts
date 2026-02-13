import { createSignal } from "solid-js";

const STORAGE_KEY = "dusk-sidebar-width";

function loadWidth(): number {
  if (typeof window === "undefined") return 300;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed >= 300 && parsed <= 600) {
      return parsed;
    }
  }
  return 300;
}

function saveWidth(width: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, width.toString());
}

const [sidebarWidth, setSidebarWidth] = createSignal(loadWidth());

function updateSidebarWidth(width: number) {
  setSidebarWidth(width);
  saveWidth(width);
}

export { sidebarWidth, updateSidebarWidth };
