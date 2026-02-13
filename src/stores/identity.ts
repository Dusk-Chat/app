import { createSignal } from "solid-js";
import type { PublicIdentity } from "../lib/types";

const [identity, setIdentity] = createSignal<PublicIdentity | null>(null);
const [isLoaded, setIsLoaded] = createSignal(false);

export function setCurrentIdentity(id: PublicIdentity | null) {
  setIdentity(id);
  setIsLoaded(true);
}

export function updateIdentity(updates: Partial<PublicIdentity>) {
  setIdentity((prev) => (prev ? { ...prev, ...updates } : null));
}

export { identity, isLoaded };
