import { Component, createSignal, createEffect, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  X,
  Info,
  Hash,
  Volume2,
  Users,
  UserPlus,
  AlertTriangle,
  Copy,
  Check,
  Pencil,
  Trash2,
  Shield,
  Crown,
  ChevronDown,
} from "lucide-solid";
import { identity } from "../../stores/identity";
import {
  activeCommunity,
  updateCommunityMeta,
  removeCommunity,
} from "../../stores/communities";
import {
  channels,
  categories,
  removeChannel,
  removeCategory,
  updateChannelMeta,
  setChannels,
  setCategories,
  setActiveChannel,
} from "../../stores/channels";
import {
  members,
  removeMember,
  updateMemberRole,
  setMembers,
} from "../../stores/members";
import { clearMessages } from "../../stores/messages";
import * as tauri from "../../lib/tauri";
import Avatar from "../common/Avatar";
import Button from "../common/Button";
import type { ChannelMeta, CategoryMeta, Member } from "../../lib/types";

type CommunitySettingsSection =
  | "overview"
  | "channels"
  | "members"
  | "invites"
  | "danger";

interface CommunitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string | null;
  initialSection?: CommunitySettingsSection;
}

const CommunitySettingsModal: Component<CommunitySettingsModalProps> = (
  props,
) => {
  const [activeSection, setActiveSection] =
    createSignal<CommunitySettingsSection>("overview");

  // derive the local user's highest role
  const localUserRole = () => {
    const id = identity();
    const memberList = members();
    if (!id) return "member";
    const member = memberList.find((m) => m.peer_id === id.peer_id);
    if (!member) return "member";
    if (member.roles.includes("owner")) return "owner";
    if (member.roles.includes("admin")) return "admin";
    return "member";
  };

  const isOwner = () => localUserRole() === "owner";
  const isAdmin = () =>
    localUserRole() === "owner" || localUserRole() === "admin";

  // reset to initial tab when modal opens
  createEffect(() => {
    if (props.isOpen) {
      setActiveSection(props.initialSection ?? "overview");
    }
  });

  const community = () => activeCommunity();

  const sections: {
    id: CommunitySettingsSection;
    label: string;
    icon: typeof Info;
  }[] = [
    { id: "overview", label: "overview", icon: Info },
    { id: "channels", label: "channels", icon: Hash },
    { id: "members", label: "members", icon: Users },
    { id: "invites", label: "invites", icon: UserPlus },
    { id: "danger", label: "danger zone", icon: AlertTriangle },
  ];

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 animate-fade-in">
          <div class="bg-gray-900 border-2 border-white/20 w-full max-w-[800px] h-[600px] mx-4 animate-scale-in flex overflow-hidden">
            {/* sidebar navigation */}
            <div class="w-[200px] shrink-0 bg-black border-r border-white/10 flex flex-col">
              <div class="p-4 border-b border-white/10">
                <h2 class="text-[14px] font-mono uppercase tracking-[0.05em] text-white/60">
                  server settings
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
                  {activeSection() === "danger"
                    ? "danger zone"
                    : activeSection()}
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
                <Show when={activeSection() === "overview"}>
                  <OverviewSection
                    communityId={props.communityId}
                    isAdmin={isAdmin()}
                    onClose={props.onClose}
                  />
                </Show>

                <Show when={activeSection() === "channels"}>
                  <ChannelsSection
                    communityId={props.communityId}
                    isAdmin={isAdmin()}
                  />
                </Show>

                <Show when={activeSection() === "members"}>
                  <MembersSection
                    communityId={props.communityId}
                    isOwner={isOwner()}
                    isAdmin={isAdmin()}
                  />
                </Show>

                <Show when={activeSection() === "invites"}>
                  <InvitesSection communityId={props.communityId} />
                </Show>

                <Show when={activeSection() === "danger"}>
                  <DangerZoneSection
                    communityId={props.communityId}
                    isOwner={isOwner()}
                    onClose={props.onClose}
                    onNavigateToTransfer={() => setActiveSection("members")}
                  />
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

// -- overview section --

interface OverviewSectionProps {
  communityId: string | null;
  isAdmin: boolean;
  onClose: () => void;
}

const OverviewSection: Component<OverviewSectionProps> = (props) => {
  const [localName, setLocalName] = createSignal("");
  const [localDescription, setLocalDescription] = createSignal("");
  const [copied, setCopied] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const community = () => activeCommunity();

  // sync local state from the community when it changes
  createEffect(() => {
    const comm = community();
    if (comm) {
      setLocalName(comm.name);
      setLocalDescription(comm.description);
    }
  });

  async function handleSave() {
    const communityId = props.communityId;
    if (!communityId) return;

    const name = localName().trim();
    if (!name) return;

    setSaving(true);
    try {
      const updated = await tauri.updateCommunity(
        communityId,
        name,
        localDescription().trim(),
      );
      updateCommunityMeta(communityId, {
        name: updated.name,
        description: updated.description,
      });
    } catch (e) {
      console.error("failed to update community:", e);
    }
    setSaving(false);
  }

  function copyId() {
    const comm = community();
    if (comm?.id) {
      navigator.clipboard.writeText(comm.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const hasChanges = () => {
    const comm = community();
    if (!comm) return false;
    return (
      localName().trim() !== comm.name ||
      localDescription().trim() !== comm.description
    );
  };

  const createdDate = () => {
    const comm = community();
    if (!comm) return "";
    return new Date(comm.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div class="space-y-6">
      {/* community name */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          community name
        </label>
        <input
          type="text"
          class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          placeholder="community name"
          value={localName()}
          onInput={(e) => setLocalName(e.currentTarget.value)}
          maxLength={64}
          disabled={!props.isAdmin}
        />
        <p class="mt-1 text-[11px] font-mono text-white/30">
          {localName().length}/64 characters
        </p>
      </div>

      {/* description */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          description
        </label>
        <textarea
          class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200 resize-none h-24 disabled:opacity-40 disabled:cursor-not-allowed"
          placeholder="what's this community about?"
          value={localDescription()}
          onInput={(e) => setLocalDescription(e.currentTarget.value)}
          maxLength={256}
          disabled={!props.isAdmin}
        />
        <p class="mt-1 text-[11px] font-mono text-white/30">
          {localDescription().length}/256 characters
        </p>
      </div>

      {/* community id */}
      <div>
        <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
          community id
        </label>
        <div class="flex items-center gap-2">
          <div class="flex-1 bg-black border-2 border-white/20 px-4 py-3 font-mono text-[13px] text-white/70 truncate">
            {community()?.id ?? "---"}
          </div>
          <button
            type="button"
            class="p-3 bg-gray-800 border-2 border-white/20 hover:border-white/40 transition-colors duration-200 cursor-pointer"
            onClick={copyId}
          >
            <Show
              when={copied()}
              fallback={<Copy size={18} class="text-white/60" />}
            >
              <Check size={18} class="text-green-500" />
            </Show>
          </button>
        </div>
      </div>

      {/* metadata */}
      <div class="pt-4 border-t border-white/10 space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-[12px] font-mono text-white/40">created by</span>
          <span class="text-[12px] font-mono text-white/60 truncate max-w-[300px]">
            {community()?.created_by ?? "---"}
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[12px] font-mono text-white/40">created</span>
          <span class="text-[12px] font-mono text-white/60">
            {createdDate()}
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[12px] font-mono text-white/40">members</span>
          <span class="text-[12px] font-mono text-white/60">
            {members().length}
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[12px] font-mono text-white/40">channels</span>
          <span class="text-[12px] font-mono text-white/60">
            {channels().length}
          </span>
        </div>
      </div>

      {/* save button for admins */}
      <Show when={props.isAdmin && hasChanges()}>
        <div class="pt-4 border-t border-white/10 flex justify-end">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving() || !localName().trim()}
          >
            {saving() ? "saving..." : "save changes"}
          </Button>
        </div>
      </Show>
    </div>
  );
};

// -- channels section --

interface ChannelsSectionProps {
  communityId: string | null;
  isAdmin: boolean;
}

const ChannelsSection: Component<ChannelsSectionProps> = (props) => {
  const [editingChannelId, setEditingChannelId] = createSignal<string | null>(
    null,
  );
  const [editName, setEditName] = createSignal("");
  const [editTopic, setEditTopic] = createSignal("");
  const [deletingChannelId, setDeletingChannelId] = createSignal<string | null>(
    null,
  );
  const [deletingCategoryId, setDeletingCategoryId] = createSignal<
    string | null
  >(null);

  // channels without a category
  const uncategorized = () => channels().filter((c) => !c.category_id);

  // channels belonging to a specific category
  const channelsForCategory = (catId: string) =>
    channels().filter((c) => c.category_id === catId);

  function startEdit(channel: ChannelMeta) {
    setEditingChannelId(channel.id);
    setEditName(channel.name);
    setEditTopic(channel.topic);
  }

  function cancelEdit() {
    setEditingChannelId(null);
    setEditName("");
    setEditTopic("");
  }

  async function saveEdit(channelId: string) {
    if (!props.communityId || !editName().trim()) return;

    try {
      const updated = await tauri.updateChannel(
        props.communityId,
        channelId,
        editName().trim(),
        editTopic().trim(),
      );
      updateChannelMeta(channelId, {
        name: updated.name,
        topic: updated.topic,
      });
    } catch (e) {
      console.error("failed to update channel:", e);
    }
    cancelEdit();
  }

  async function handleDeleteChannel(channelId: string) {
    if (!props.communityId) return;

    try {
      await tauri.deleteChannel(props.communityId, channelId);
      removeChannel(channelId);
    } catch (e) {
      console.error("failed to delete channel:", e);
    }
    setDeletingChannelId(null);
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!props.communityId) return;

    try {
      await tauri.deleteCategory(props.communityId, categoryId);
      removeCategory(categoryId);
    } catch (e) {
      console.error("failed to delete category:", e);
    }
    setDeletingCategoryId(null);
  }

  const ChannelRow: Component<{ channel: ChannelMeta }> = (rowProps) => {
    const isEditing = () => editingChannelId() === rowProps.channel.id;
    const isDeleting = () => deletingChannelId() === rowProps.channel.id;
    const Icon = rowProps.channel.kind === "Voice" ? Volume2 : Hash;

    return (
      <div class="border border-white/10 bg-black/30">
        <Show
          when={!isEditing()}
          fallback={
            // edit form
            <div class="p-3 space-y-3">
              <div>
                <label class="block text-[11px] font-mono text-white/40 mb-1">
                  name
                </label>
                <input
                  type="text"
                  class="w-full bg-black border-2 border-white/20 text-white text-[14px] px-3 py-2 outline-none focus:border-orange transition-colors duration-200"
                  value={editName()}
                  onInput={(e) => setEditName(e.currentTarget.value)}
                  maxLength={64}
                />
              </div>
              <div>
                <label class="block text-[11px] font-mono text-white/40 mb-1">
                  topic
                </label>
                <input
                  type="text"
                  class="w-full bg-black border-2 border-white/20 text-white text-[14px] px-3 py-2 outline-none focus:border-orange transition-colors duration-200"
                  value={editTopic()}
                  onInput={(e) => setEditTopic(e.currentTarget.value)}
                  maxLength={256}
                />
              </div>
              <div class="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => saveEdit(rowProps.channel.id)}
                  disabled={!editName().trim()}
                >
                  save
                </Button>
              </div>
            </div>
          }
        >
          <Show
            when={!isDeleting()}
            fallback={
              // delete confirmation
              <div class="p-3 space-y-3">
                <p class="text-[14px] text-white">
                  delete <span class="font-bold">{rowProps.channel.name}</span>?
                  this will remove all messages in this channel.
                </p>
                <div class="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingChannelId(null)}
                  >
                    cancel
                  </Button>
                  <button
                    type="button"
                    class="px-4 py-1.5 text-[13px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors duration-200 cursor-pointer"
                    onClick={() => handleDeleteChannel(rowProps.channel.id)}
                  >
                    delete
                  </button>
                </div>
              </div>
            }
          >
            {/* normal display */}
            <div class="flex items-center gap-3 px-3 py-2.5">
              <Icon size={16} class="shrink-0 text-white/40" />
              <div class="flex-1 min-w-0">
                <p class="text-[14px] text-white truncate">
                  {rowProps.channel.name}
                </p>
                <Show when={rowProps.channel.topic}>
                  <p class="text-[12px] text-white/40 truncate">
                    {rowProps.channel.topic}
                  </p>
                </Show>
              </div>
              <Show when={props.isAdmin}>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    class="p-1.5 text-white/30 hover:text-white/60 transition-colors duration-200 cursor-pointer"
                    onClick={() => startEdit(rowProps.channel)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    class="p-1.5 text-white/30 hover:text-red-400 transition-colors duration-200 cursor-pointer"
                    onClick={() => setDeletingChannelId(rowProps.channel.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    );
  };

  return (
    <div class="space-y-6">
      <p class="text-[13px] text-white/50">
        {channels().length} channel{channels().length !== 1 ? "s" : ""} across{" "}
        {categories().length} categor
        {categories().length !== 1 ? "ies" : "y"}
      </p>

      {/* uncategorized channels */}
      <Show when={uncategorized().length > 0}>
        <div>
          <h4 class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
            uncategorized
          </h4>
          <div class="space-y-1">
            <For each={uncategorized()}>
              {(channel) => <ChannelRow channel={channel} />}
            </For>
          </div>
        </div>
      </Show>

      {/* categorized channels */}
      <For each={categories()}>
        {(cat) => {
          const catChannels = () => channelsForCategory(cat.id);
          const isDeleting = () => deletingCategoryId() === cat.id;

          return (
            <div>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60">
                  {cat.name}
                </h4>
                <Show when={props.isAdmin}>
                  <Show
                    when={!isDeleting()}
                    fallback={
                      <div class="flex items-center gap-2">
                        <span class="text-[11px] text-white/40">
                          delete category?
                        </span>
                        <button
                          type="button"
                          class="text-[11px] text-white/50 hover:text-white cursor-pointer"
                          onClick={() => setDeletingCategoryId(null)}
                        >
                          no
                        </button>
                        <button
                          type="button"
                          class="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          yes
                        </button>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      class="p-1 text-white/30 hover:text-red-400 transition-colors duration-200 cursor-pointer"
                      onClick={() => setDeletingCategoryId(cat.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </Show>
                </Show>
              </div>
              <div class="space-y-1">
                <For each={catChannels()}>
                  {(channel) => <ChannelRow channel={channel} />}
                </For>
                <Show when={catChannels().length === 0}>
                  <p class="text-[12px] text-white/30 px-3 py-2">
                    no channels in this category
                  </p>
                </Show>
              </div>
            </div>
          );
        }}
      </For>

      <Show when={channels().length === 0}>
        <p class="text-[14px] text-white/40 text-center py-8">
          no channels yet
        </p>
      </Show>
    </div>
  );
};

// -- members section --

interface MembersSectionProps {
  communityId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
}

const MembersSection: Component<MembersSectionProps> = (props) => {
  const [transferTarget, setTransferTarget] = createSignal<Member | null>(null);
  const [transferConfirm, setTransferConfirm] = createSignal("");
  const [roleDropdownOpen, setRoleDropdownOpen] = createSignal<string | null>(
    null,
  );

  const localPeerId = () => identity()?.peer_id ?? "";

  // sort: owner first, then admin, then member
  const sortedMembers = () => {
    const roleOrder = (m: Member) => {
      if (m.roles.includes("owner")) return 0;
      if (m.roles.includes("admin")) return 1;
      return 2;
    };
    return [...members()].sort((a, b) => roleOrder(a) - roleOrder(b));
  };

  async function handleRoleChange(peerId: string, role: string) {
    if (!props.communityId) return;

    try {
      await tauri.setMemberRole(props.communityId, peerId, role);
      updateMemberRole(peerId, [role]);
    } catch (e) {
      console.error("failed to set member role:", e);
    }
    setRoleDropdownOpen(null);
  }

  async function handleKick(peerId: string) {
    if (!props.communityId) return;

    try {
      await tauri.kickMember(props.communityId, peerId);
      removeMember(peerId);
    } catch (e) {
      console.error("failed to kick member:", e);
    }
  }

  async function handleTransfer() {
    const target = transferTarget();
    if (!props.communityId || !target) return;

    try {
      await tauri.transferOwnership(props.communityId, target.peer_id);
      // update local store to reflect the change
      updateMemberRole(localPeerId(), ["admin"]);
      updateMemberRole(target.peer_id, ["owner"]);
    } catch (e) {
      console.error("failed to transfer ownership:", e);
    }
    setTransferTarget(null);
    setTransferConfirm("");
  }

  function roleBadge(member: Member) {
    if (member.roles.includes("owner")) return "owner";
    if (member.roles.includes("admin")) return "admin";
    return "member";
  }

  function roleBadgeClass(role: string) {
    if (role === "owner")
      return "bg-orange/15 text-orange border border-orange/30";
    if (role === "admin")
      return "bg-white/5 text-white/70 border border-white/20";
    return "bg-white/5 text-white/40 border border-white/10";
  }

  const joinDate = (timestamp: number) => {
    if (!timestamp) return "---";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div class="space-y-6">
      <p class="text-[13px] text-white/50">
        {members().length} member{members().length !== 1 ? "s" : ""}
      </p>

      {/* member list */}
      <div class="space-y-1">
        <For each={sortedMembers()}>
          {(member) => {
            const isSelf = () => member.peer_id === localPeerId();
            const isTargetOwner = () => member.roles.includes("owner");
            const currentRole = () => roleBadge(member);
            const showRoleDropdown = () =>
              roleDropdownOpen() === member.peer_id;

            return (
              <div class="flex items-center gap-3 px-3 py-2.5 border border-white/10 bg-black/30 group">
                <Avatar
                  name={member.display_name}
                  size="sm"
                  status={member.status}
                  showStatus
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-[14px] text-white truncate">
                      {member.display_name}
                    </span>
                    <span
                      class={`px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${roleBadgeClass(currentRole())}`}
                    >
                      {currentRole()}
                    </span>
                    <Show when={isSelf()}>
                      <span class="text-[10px] font-mono text-white/30">
                        (you)
                      </span>
                    </Show>
                  </div>
                  <p class="text-[11px] font-mono text-white/30">
                    joined {joinDate(member.joined_at)}
                  </p>
                </div>

                {/* role management and kick controls */}
                <Show when={!isSelf() && !isTargetOwner()}>
                  <div class="flex items-center gap-1 shrink-0">
                    {/* role dropdown - owner only */}
                    <Show when={props.isOwner}>
                      <div class="relative">
                        <button
                          type="button"
                          class="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-white/40 hover:text-white/60 border border-white/10 hover:border-white/20 transition-colors duration-200 cursor-pointer"
                          onClick={() =>
                            setRoleDropdownOpen(
                              showRoleDropdown() ? null : member.peer_id,
                            )
                          }
                        >
                          {currentRole()}
                          <ChevronDown size={10} />
                        </button>
                        <Show when={showRoleDropdown()}>
                          <div class="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-white/10 min-w-[100px]">
                            <button
                              type="button"
                              class={`w-full px-3 py-2 text-left text-[12px] transition-colors duration-200 cursor-pointer ${
                                currentRole() === "admin"
                                  ? "text-orange bg-orange/10"
                                  : "text-white/60 hover:bg-white/5"
                              }`}
                              onClick={() =>
                                handleRoleChange(member.peer_id, "admin")
                              }
                            >
                              <div class="flex items-center gap-2">
                                <Shield size={12} />
                                admin
                              </div>
                            </button>
                            <button
                              type="button"
                              class={`w-full px-3 py-2 text-left text-[12px] transition-colors duration-200 cursor-pointer ${
                                currentRole() === "member"
                                  ? "text-orange bg-orange/10"
                                  : "text-white/60 hover:bg-white/5"
                              }`}
                              onClick={() =>
                                handleRoleChange(member.peer_id, "member")
                              }
                            >
                              <div class="flex items-center gap-2">
                                <Users size={12} />
                                member
                              </div>
                            </button>
                          </div>
                        </Show>
                      </div>
                    </Show>

                    {/* kick button - admin/owner */}
                    <Show when={props.isAdmin}>
                      <button
                        type="button"
                        class="p-1.5 text-white/30 hover:text-red-400 transition-colors duration-200 cursor-pointer"
                        onClick={() => handleKick(member.peer_id)}
                        title="kick member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* transfer ownership - owner only */}
      <Show when={props.isOwner}>
        <div class="pt-6 border-t border-white/10">
          <h4 class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-3">
            transfer ownership
          </h4>

          <Show
            when={!transferTarget()}
            fallback={
              <div class="p-4 bg-orange/5 border-2 border-orange/30 space-y-3">
                <p class="text-[14px] text-white">
                  transfer ownership to{" "}
                  <span class="font-bold text-orange">
                    {transferTarget()!.display_name}
                  </span>
                  ? you will be demoted to admin.
                </p>
                <p class="text-[13px] text-white/60">
                  type{" "}
                  <span class="font-mono text-orange">
                    {transferTarget()!.display_name}
                  </span>{" "}
                  to confirm
                </p>
                <input
                  type="text"
                  class="w-full bg-black border-2 border-orange/30 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/20 focus:border-orange transition-colors duration-200"
                  placeholder="type display name to confirm"
                  value={transferConfirm()}
                  onInput={(e) => setTransferConfirm(e.currentTarget.value)}
                />
                <div class="flex gap-3 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setTransferTarget(null);
                      setTransferConfirm("");
                    }}
                  >
                    cancel
                  </Button>
                  <button
                    type="button"
                    disabled={
                      transferConfirm() !== transferTarget()!.display_name
                    }
                    class={`px-6 py-2 text-[14px] font-medium border-2 transition-all duration-200 ${
                      transferConfirm() === transferTarget()!.display_name
                        ? "bg-orange border-orange text-white cursor-pointer hover:bg-orange-hover"
                        : "bg-gray-800 border-white/10 text-white/30 cursor-not-allowed"
                    }`}
                    onClick={handleTransfer}
                  >
                    transfer ownership
                  </button>
                </div>
              </div>
            }
          >
            <p class="text-[13px] text-white/50 mb-3">
              select a member to transfer community ownership to. this action
              will demote you to admin.
            </p>
            <div class="space-y-1">
              <For
                each={members().filter(
                  (m) =>
                    m.peer_id !== localPeerId() && !m.roles.includes("owner"),
                )}
              >
                {(member) => (
                  <button
                    type="button"
                    class="flex items-center gap-3 w-full px-3 py-2 border border-white/10 bg-black/30 hover:border-orange/30 transition-colors duration-200 cursor-pointer"
                    onClick={() => setTransferTarget(member)}
                  >
                    <Crown size={14} class="text-white/30" />
                    <span class="text-[14px] text-white">
                      {member.display_name}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// -- invites section --

interface InvitesSectionProps {
  communityId: string | null;
}

const InvitesSection: Component<InvitesSectionProps> = (props) => {
  const [inviteCode, setInviteCode] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  async function generateCode() {
    if (!props.communityId) return;

    setLoading(true);
    setCopied(false);
    try {
      const code = await tauri.generateInvite(props.communityId);
      setInviteCode(code);
    } catch (e) {
      console.error("failed to generate invite:", e);
    }
    setLoading(false);
  }

  async function copyCode() {
    const code = inviteCode();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for nonsecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div class="space-y-6">
      <p class="text-[14px] text-white/60">
        generate an invite code to share with others so they can join{" "}
        <span class="text-white font-bold">
          {activeCommunity()?.name ?? "this server"}
        </span>
      </p>

      <Show
        when={inviteCode()}
        fallback={
          <Button variant="primary" onClick={generateCode} disabled={loading()}>
            {loading() ? "generating..." : "generate invite code"}
          </Button>
        }
      >
        <div class="space-y-3">
          <div class="flex gap-2">
            <input
              type="text"
              class="flex-1 bg-black border-2 border-white/20 text-white text-[14px] font-mono px-4 py-3 outline-none select-all focus:border-orange transition-colors duration-200"
              value={inviteCode()}
              readOnly
              onClick={(e) => e.currentTarget.select()}
            />
            <Button
              variant={copied() ? "secondary" : "primary"}
              onClick={copyCode}
            >
              {copied() ? "copied" : "copy"}
            </Button>
          </div>

          <Button variant="ghost" onClick={generateCode} disabled={loading()}>
            generate new code
          </Button>
        </div>
      </Show>

      <div class="pt-4 border-t border-white/10">
        <p class="text-[12px] text-white/30 font-mono">
          invite codes never contain IP addresses. peers discover each other
          through the relay's rendezvous protocol. no personal information is
          shared in the invite.
        </p>
      </div>
    </div>
  );
};

// -- danger zone section --

interface DangerZoneSectionProps {
  communityId: string | null;
  isOwner: boolean;
  onClose: () => void;
  onNavigateToTransfer?: () => void;
}

const DangerZoneSection: Component<DangerZoneSectionProps> = (props) => {
  const [confirmingLeave, setConfirmingLeave] = createSignal(false);
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [deleteConfirmText, setDeleteConfirmText] = createSignal("");

  async function handleLeave() {
    if (!props.communityId) return;

    try {
      await tauri.leaveCommunity(props.communityId);
    } catch (e) {
      console.error("failed to leave community:", e);
    }

    removeCommunity(props.communityId!);
    setChannels([]);
    setCategories([]);
    setActiveChannel(null);
    clearMessages();
    setMembers([]);

    props.onClose();
  }

  async function handleDelete() {
    // in a p2p system, "delete" means leave and wipe local data
    // other peers still have the crdt document
    await handleLeave();
  }

  return (
    <div class="space-y-6">
      {/* leave server */}
      <Show when={!props.isOwner}>
        <div class="p-4 bg-black/50 border border-red-500/20">
          <Show
            when={!confirmingLeave()}
            fallback={
              <div class="space-y-3">
                <p class="text-[14px] text-white">
                  are you sure you want to leave{" "}
                  <span class="font-bold">
                    {activeCommunity()?.name ?? "this server"}
                  </span>
                  ? you can rejoin later with a new invite code.
                </p>
                <div class="flex gap-3 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmingLeave(false)}
                  >
                    cancel
                  </Button>
                  <button
                    type="button"
                    class="px-6 py-2 text-[14px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors duration-200 cursor-pointer"
                    onClick={handleLeave}
                  >
                    leave server
                  </button>
                </div>
              </div>
            }
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-[14px] font-medium text-white">leave server</p>
                <p class="text-[12px] text-white/50 mt-1">
                  leave this community. you can rejoin with a new invite.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setConfirmingLeave(true)}>
                <span class="text-red-500">leave</span>
              </Button>
            </div>
          </Show>
        </div>
      </Show>

      {/* delete community - owner only */}
      <Show when={props.isOwner}>
        <div class="flex items-center gap-2 mb-4">
          <AlertTriangle size={16} class="text-red-500" />
          <h4 class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-red-500">
            destructive actions
          </h4>
        </div>

        <div class="p-4 bg-black/50 border border-red-500/20">
          <Show
            when={!confirmingDelete()}
            fallback={
              <div class="p-4 bg-red-500/5 border-2 border-red-500/40 space-y-4">
                <p class="text-[14px] text-white">
                  this will remove{" "}
                  <span class="font-bold text-red-500">
                    {activeCommunity()?.name ?? "this server"}
                  </span>{" "}
                  from your local storage. in a peer-to-peer network, other
                  members will still have their copies of the community data.
                </p>
                <p class="text-[13px] text-white/60">
                  type <span class="font-mono text-red-400">DELETE</span> to
                  confirm
                </p>
                <input
                  type="text"
                  class="w-full bg-black border-2 border-red-500/30 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/20 focus:border-red-500 transition-colors duration-200"
                  placeholder="type DELETE to confirm"
                  value={deleteConfirmText()}
                  onInput={(e) => setDeleteConfirmText(e.currentTarget.value)}
                />
                <div class="flex gap-3 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteConfirmText("");
                    }}
                  >
                    cancel
                  </Button>
                  <button
                    type="button"
                    disabled={deleteConfirmText() !== "DELETE"}
                    class={`px-6 py-2 text-[14px] font-medium border-2 transition-all duration-200 ${
                      deleteConfirmText() === "DELETE"
                        ? "bg-red-500 border-red-500 text-white cursor-pointer hover:bg-red-600"
                        : "bg-gray-800 border-white/10 text-white/30 cursor-not-allowed"
                    }`}
                    onClick={handleDelete}
                  >
                    delete community
                  </button>
                </div>
              </div>
            }
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-[14px] font-medium text-white">
                  delete community
                </p>
                <p class="text-[12px] text-white/50 mt-1">
                  remove this community from your local storage and leave
                </p>
              </div>
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                <span class="text-red-500">delete</span>
              </Button>
            </div>
          </Show>
        </div>

        {/* leave as owner note */}
        <div class="flex items-start justify-between gap-4 mt-2">
          <p class="text-[12px] text-white/30 font-mono">
            as the owner, consider transferring ownership before leaving. if you
            leave without transferring, other members will still have the
            community data but no one will have owner permissions locally.
          </p>
          <Show when={props.onNavigateToTransfer}>
            <button
              type="button"
              class="text-[12px] text-orange font-mono whitespace-nowrap hover:text-orange/80 transition-colors duration-200 cursor-pointer bg-transparent border-none"
              onClick={() => props.onNavigateToTransfer?.()}
            >
              transfer ownership
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default CommunitySettingsModal;
