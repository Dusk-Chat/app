import { createSignal } from "solid-js";
import type { CommunityMeta } from "../lib/types";
import * as tauri from "../lib/tauri";

const [communities, setCommunities] = createSignal<CommunityMeta[]>([]);
const [activeCommunityId, setActiveCommunityId] = createSignal<string | null>(
  null,
);

export function addCommunity(community: CommunityMeta) {
  setCommunities((prev) => [...prev, community]);
}

export function removeCommunity(id: string) {
  setCommunities((prev) => prev.filter((c) => c.id !== id));
  if (activeCommunityId() === id) {
    setActiveCommunityId(null);
  }
}

export function setActiveCommunity(id: string | null) {
  setActiveCommunityId(id);
}

export function activeCommunity(): CommunityMeta | undefined {
  return communities().find((c) => c.id === activeCommunityId());
}

export async function createCommunity(
  name: string,
  description: string,
): Promise<CommunityMeta> {
  const community = await tauri.createCommunity(name, description);
  addCommunity(community);
  return community;
}

export async function joinCommunity(inviteCode: string): Promise<CommunityMeta> {
  const community = await tauri.joinCommunity(inviteCode);
  addCommunity(community);
  return community;
}

export async function leaveCommunity(communityId: string): Promise<void> {
  await tauri.leaveCommunity(communityId);
  removeCommunity(communityId);
}

export function updateCommunityMeta(
  id: string,
  updates: Partial<CommunityMeta>,
) {
  setCommunities((prev) =>
    prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
  );
}

export { communities, activeCommunityId, setCommunities };
