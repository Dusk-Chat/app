import { For, Show, createMemo, createSignal, type Component } from "solid-js";
import { members, removeMember } from "../../stores/members";
import { activeCommunityId } from "../../stores/communities";
import { identity } from "../../stores/identity";
import Avatar from "../common/Avatar";
import SidebarLayout from "../common/SidebarLayout";
import * as tauri from "../../lib/tauri";

const UserSidebar: Component = () => {
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; memberId: string; memberName: string; memberRoles: string[] } | null>(null);

  const groupedMembers = createMemo(() => {
    const memberList = members();
    const groups = new Map<string, typeof memberList>();

    for (const member of memberList) {
      const role = member.roles[0] ?? "member";
      if (!groups.has(role)) {
        groups.set(role, []);
      }
      groups.get(role)!.push(member);
    }

    return Array.from(groups.entries());
  });

  const currentUser = () => identity();
  const currentCommunityId = () => activeCommunityId();

  function handleContextMenu(e: MouseEvent, member: { peer_id: string; display_name: string; roles: string[] }) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      memberId: member.peer_id,
      memberName: member.display_name,
      memberRoles: member.roles,
    });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  async function handleKickMember() {
    const menu = contextMenu();
    const communityId = currentCommunityId();
    if (!menu || !communityId) return;

    const user = currentUser();
    if (!user) return;

    const currentMember = members().find((m) => m.peer_id === user.peer_id);
    const isAdmin = currentMember?.roles.some((r) => r === "admin" || r === "owner");

    if (!isAdmin) {
      console.error("not authorized to kick members");
      closeContextMenu();
      return;
    }

    if (menu.memberRoles.includes("owner")) {
      console.error("cannot kick the community owner");
      closeContextMenu();
      return;
    }

    try {
      await tauri.kickMember(communityId, menu.memberId);
      removeMember(menu.memberId);
    } catch (e) {
      console.error("failed to kick member:", e);
    }

    closeContextMenu();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("click", closeContextMenu);
  }

  const body = (
    <div class="py-4">
      <For each={groupedMembers()}>
        {([role, roleMembers]) => (
          <div class="mb-4">
            <div class="px-4 py-1.5 text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-orange">
              {role} - {roleMembers.length}
            </div>

            <For each={roleMembers}>
              {(member) => (
                <button
                  type="button"
                  class="flex items-center gap-3 w-full h-10 px-4 text-left hover:bg-gray-800 transition-colors duration-200 cursor-pointer group"
                  onContextMenu={(e) => handleContextMenu(e, member)}
                >
                  <Avatar
                    name={member.display_name}
                    size="sm"
                    status={member.status}
                    showStatus
                  />
                  <span class="text-[14px] text-white/80 group-hover:text-white truncate transition-colors duration-200">
                    {member.display_name}
                  </span>
                </button>
              )}
            </For>
          </div>
        )}
      </For>

      <Show when={members().length === 0}>
        <div class="px-4 py-8 text-[14px] text-white/30 text-center">
          no members to display
        </div>
      </Show>
    </div>
  );

  return (
    <SidebarLayout showFooter={false}>
      {body}
      {/* context menu */}
      <Show when={contextMenu()}>
        {(menu) => {
          const user = currentUser();
          const currentMember = user ? members().find((m) => m.peer_id === user.peer_id) : null;
          const isAdmin = currentMember?.roles.some((r) => r === "admin" || r === "owner");
          const canKick = isAdmin && !menu().memberRoles.includes("owner") && menu().memberId !== user?.peer_id;

          return (
            <div
              class="fixed bg-gray-800 border border-white/20 py-1 z-[2000] min-w-[120px]"
              style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div class="px-3 py-1.5 text-[12px] text-white/60 border-b border-white/10">
                {menu().memberName}
              </div>
              <Show when={canKick}>
                <button
                  type="button"
                  class="w-full px-3 py-1.5 text-[13px] text-left text-red-400 hover:bg-gray-700 transition-colors duration-200 cursor-pointer"
                  onClick={handleKickMember}
                >
                  kick member
                </button>
              </Show>
              <Show when={!canKick && menu().memberId !== user?.peer_id}>
                <div class="px-3 py-1.5 text-[12px] text-white/30">
                  no actions available
                </div>
              </Show>
            </div>
          );
        }}
      </Show>
    </SidebarLayout>
  );
};

export default UserSidebar;
