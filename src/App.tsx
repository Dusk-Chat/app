import {
  Component,
  onMount,
  onCleanup,
  createSignal,
  createEffect,
  on,
  Show,
  For,
} from "solid-js";
import AppLayout from "./components/layout/AppLayout";
import OverlayMenu from "./components/navigation/OverlayMenu";
import MobileNav from "./components/navigation/MobileNav";
import Modal from "./components/common/Modal";
import Button from "./components/common/Button";
import SettingsModal from "./components/settings/SettingsModal";
import CommunitySettingsModal from "./components/settings/CommunitySettingsModal";
import SignUpScreen from "./components/auth/SignUpScreen";
import SplashScreen from "./components/auth/SplashScreen";
import UserDirectoryModal from "./components/directory/UserDirectoryModal";
import ProfileCard from "./components/common/ProfileCard";
import ProfileModal from "./components/common/ProfileModal";
import { AlertTriangle } from "lucide-solid";

import {
  overlayMenuOpen,
  closeOverlay,
  activeModal,
  modalData,
  closeModal,
  openModal,
  initResponsive,
} from "./stores/ui";
import { setCurrentIdentity, identity } from "./stores/identity";
import { settings, updateSettings } from "./stores/settings";
import {
  setCommunities,
  setActiveCommunity,
  activeCommunityId,
  addCommunity,
  activeCommunity,
  removeCommunity,
} from "./stores/communities";
import {
  setChannels,
  setActiveChannel,
  activeChannelId,
  setCategories,
  addCategory,
  categories,
  channels,
  getLastChannel,
} from "./stores/channels";
import {
  addMessage,
  setMessages,
  clearMessages,
  removeMessage,
} from "./stores/messages";
import {
  members,
  setMembers,
  addTypingPeer,
  setPeerOnline,
  setPeerOffline,
  setPeerStatus,
  removeMember,
} from "./stores/members";
import {
  setPeerCount,
  setNodeStatus,
  setIsConnected,
  setRelayConnected,
  relayConnected,
} from "./stores/connection";
import {
  setDMConversations,
  activeDMPeerId,
  addDMMessage,
  setActiveDM,
  updateDMLastMessage,
  handleIncomingDM,
  addDMTypingPeer,
  clearDMTypingPeers,
  clearDMMessages,
  setDMMessages,
  updateDMPeerDisplayName,
} from "./stores/dms";
import {
  setKnownPeers,
  setFriends,
  updatePeerProfile,
  removePeer,
  clearDirectory,
} from "./stores/directory";
import {
  handleVoiceParticipantJoined,
  handleVoiceParticipantLeft,
  handleVoiceMediaStateChanged,
  handleVoiceSdpReceived,
  handleVoiceIceCandidateReceived,
} from "./stores/voice";

import * as tauri from "./lib/tauri";
import type {
  DuskEvent,
  ChallengeExport,
  ChannelMeta,
  DirectMessage,
} from "./lib/types";
import { resetSettings } from "./stores/settings";
import {
  initNotifications,
  notifyChannelMessage,
  notifyMention,
  notifyDirectMessage,
  isWindowFocused,
} from "./lib/notifications";
import { isMentioned } from "./lib/mentions";

const App: Component = () => {
  let cleanupResize: (() => void) | undefined;
  let cleanupEvents: (() => void) | undefined;

  const [tauriAvailable, setTauriAvailable] = createSignal(false);
  const [needsSignUp, setNeedsSignUp] = createSignal(false);
  const [appReady, setAppReady] = createSignal(false);
  const [showSplash, setShowSplash] = createSignal(true);
  const [newCommunityName, setNewCommunityName] = createSignal("");
  const [newCommunityDesc, setNewCommunityDesc] = createSignal("");
  const [joinInviteCode, setJoinInviteCode] = createSignal("");
  const [newChannelName, setNewChannelName] = createSignal("");
  const [newChannelTopic, setNewChannelTopic] = createSignal("");
  const [newChannelKind, setNewChannelKind] = createSignal<"Text" | "Voice">(
    "Text",
  );
  const [newChannelCategoryId, setNewChannelCategoryId] = createSignal<
    string | null
  >(null);
  const [newCategoryName, setNewCategoryName] = createSignal("");
  const [inviteCode, setInviteCode] = createSignal("");
  const [inviteLoading, setInviteLoading] = createSignal(false);
  const [inviteCopied, setInviteCopied] = createSignal(false);

  // react to community switches by loading channels, members, and selecting first channel
  createEffect(
    on(activeCommunityId, async (communityId, prev) => {
      if (communityId === prev) return;
      if (!communityId) {
        setChannels([]);
        setCategories([]);
        setActiveChannel(null);
        clearMessages();
        setMembers([]);
        return;
      }

      if (tauriAvailable()) {
        try {
          const [chs, cats] = await Promise.all([
            tauri.getChannels(communityId),
            tauri.getCategories(communityId),
          ]);
          setChannels(chs);
          setCategories(cats);

          if (chs.length > 0) {
            const last = getLastChannel(communityId);
            const restored = last && chs.some((c) => c.id === last);
            setActiveChannel(restored ? last : chs[0].id);
          } else {
            setActiveChannel(null);
            clearMessages();
          }

          const mems = await tauri.getMembers(communityId);
          setMembers(mems);
        } catch (e) {
          console.error("failed to load community data:", e);
        }
      }
    }),
  );

  // react to channel switches by loading messages for the new channel
  createEffect(
    on(activeChannelId, async (channelId, prev) => {
      if (channelId === prev) return;
      if (!channelId) {
        clearMessages();
        return;
      }

      if (tauriAvailable()) {
        try {
          clearMessages();
          const msgs = await tauri.getMessages(channelId);
          setMessages(msgs);
        } catch (e) {
          console.error("failed to load messages:", e);
        }
      }
    }),
  );

  // react to dm switches by loading messages for the selected peer
  createEffect(
    on(activeDMPeerId, async (peerId, prev) => {
      if (peerId === prev) return;
      clearDMTypingPeers();

      if (!peerId) {
        clearDMMessages();
        return;
      }

      if (tauriAvailable()) {
        try {
          clearDMMessages();
          const msgs = await tauri.getDMMessages(peerId);
          setDMMessages(msgs);
        } catch (e) {
          console.error("failed to load dm messages:", e);
        }
      }
    }),
  );

  // automatically generate invite code when the invite modal opens
  createEffect(
    on(activeModal, (modal) => {
      if (modal === "invite-people") {
        handleOpenInvite();
      }
    }),
  );

  onMount(async () => {
    cleanupResize = initResponsive();

    // detect tauri environment via the injected runtime bridge
    const isTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    console.log("tauri detection result:", isTauri);

    setTauriAvailable(isTauri);

    if (isTauri) {
      // check if identity exists before loading
      const hasExisting = await tauri.hasIdentity();
      if (hasExisting) {
        await initWithTauri();
        setAppReady(true);
      } else {
        // show the signup screen
        setNeedsSignUp(true);
      }
    } else {
      loadDemoData();
      setAppReady(true);
    }
  });

  onCleanup(() => {
    cleanupResize?.();
    cleanupEvents?.();
  });

  async function initWithTauri() {
    try {
      const existing = await tauri.loadIdentity();
      if (existing) {
        setCurrentIdentity(existing);
        // ensure settings display name matches identity
        updateSettings({ display_name: existing.display_name });
      }

      // load user settings from disk
      try {
        const loadedSettings = await tauri.loadSettings();
        // ensure identity display name takes precedence
        if (existing) {
          loadedSettings.display_name = existing.display_name;
        }
        updateSettings(loadedSettings);
      } catch {
        // settings not found, use defaults
      }

      // initialize notification permission
      await initNotifications();

      // load the peer directory and friends list
      try {
        const peers = await tauri.getKnownPeers();
        setKnownPeers(peers);
        const friendsList = await tauri.getFriends();
        setFriends(friendsList);
      } catch {
        // directory not populated yet, that's fine
      }

      // load existing dm conversations from disk
      try {
        const convos = await tauri.getDMConversations();
        setDMConversations(convos);
      } catch {
        // no dm history yet, that's fine
      }

      const communities = await tauri.getCommunities();
      setCommunities(communities);

      // register the event listener before starting the node so we don't
      // miss the initial NodeStatus event emitted during startup
      const unlisten = await tauri.onDuskEvent(handleDuskEvent);
      cleanupEvents = unlisten;

      setNodeStatus("starting");
      await tauri.startNode();
      // node is running but connection status is determined by backend events.
      // do not optimistically set isConnected here - the node_status event
      // from the backend will set the accurate state once peers are found.
      setNodeStatus("running");

      // start at the home screen, user can select a community from the sidebar
    } catch (e) {
      console.error("initialization error:", e);
      setNodeStatus("error");
    }
  }

  function handleDuskEvent(event: DuskEvent) {
    switch (event.kind) {
      case "message_received": {
        const msg = event.payload;
        const currentChannelId = activeChannelId();
        const currentCommunity = activeCommunity();
        const currentPeerId = identity()?.peer_id;

        // add to store if this is the active channel
        if (msg.channel_id === currentChannelId) {
          addMessage(msg);
        }

        // check if the current user is mentioned in this message
        const mentioned =
          currentPeerId && isMentioned(msg.content, currentPeerId);

        if (mentioned && msg.channel_id !== currentChannelId) {
          // mention notifications fire even when the window is focused,
          // as long as it isnt the active channel
          const channelList = channels();
          const channel = channelList.find((c) => c.id === msg.channel_id);
          const channelName = channel?.name ?? "unknown channel";
          const communityName = currentCommunity?.name ?? "unknown community";
          const communityId =
            channel?.community_id ?? currentCommunity?.id ?? "";
          notifyMention(msg, channelName, communityName, communityId);
        } else if (
          !isWindowFocused() ||
          msg.channel_id !== currentChannelId
        ) {
          // regular notification for non-mention messages
          const channelList = channels();
          const channel = channelList.find((c) => c.id === msg.channel_id);
          const channelName = channel?.name ?? "unknown channel";
          const communityName = currentCommunity?.name ?? "unknown community";
          const communityId =
            channel?.community_id ?? currentCommunity?.id ?? "";
          notifyChannelMessage(msg, channelName, communityName, communityId);
        }
        break;
      }
      case "message_deleted":
        removeMessage(event.payload.message_id);
        break;
      case "member_kicked":
        removeMember(event.payload.peer_id);
        break;
      case "peer_connected":
        setPeerOnline(event.payload.peer_id);
        break;
      case "peer_disconnected":
        setPeerOffline(event.payload.peer_id);
        break;
      case "presence_updated": {
        const status = event.payload.status as
          | "Online"
          | "Idle"
          | "Dnd"
          | "Offline";
        setPeerStatus(event.payload.peer_id, status);
        break;
      }
      case "typing":
        if (event.payload.channel_id === activeChannelId()) {
          addTypingPeer(event.payload.peer_id);
        }
        break;
      case "node_status":
        setIsConnected(event.payload.is_connected);
        setPeerCount(event.payload.peer_count);
        // the node is still running even with zero peers, only mark stopped
        // if the node itself has shut down (handled by stop_node command)
        break;
      case "sync_complete":
        if (event.payload.community_id === activeCommunityId()) {
          reloadCurrentChannel();
        }
        break;
      case "profile_received":
        // update our local directory cache when a peer announces their profile
        updatePeerProfile(
          event.payload.peer_id,
          event.payload.display_name,
          event.payload.bio,
          event.payload.public_key,
        );
        // keep dm conversation names in sync
        updateDMPeerDisplayName(
          event.payload.peer_id,
          event.payload.display_name,
        );
        break;
      case "profile_revoked":
        // peer revoked their identity, remove them from our local directory
        removePeer(event.payload.peer_id);
        break;
      case "relay_status":
        setRelayConnected(event.payload.connected);
        break;
      case "dm_received": {
        const dm = event.payload;
        handleIncomingDM(dm);

        // send notification if window is not focused or this is not the active dm
        const currentDMPeer = activeDMPeerId();
        if (!isWindowFocused() || dm.from_peer !== currentDMPeer) {
          notifyDirectMessage(
            {
              id: dm.id,
              channel_id: "",
              author_id: dm.from_peer,
              author_name: dm.from_display_name,
              content: dm.content,
              timestamp: dm.timestamp,
              edited: false,
            },
            dm.from_peer,
          );
        }
        break;
      }
      case "dm_typing":
        // only show typing if the sender is the active dm peer
        if (event.payload.peer_id === activeDMPeerId()) {
          addDMTypingPeer(event.payload.peer_id);
        }
        break;
      case "voice_participant_joined":
        handleVoiceParticipantJoined(event.payload);
        break;
      case "voice_participant_left":
        handleVoiceParticipantLeft(event.payload);
        break;
      case "voice_media_state_changed":
        handleVoiceMediaStateChanged(event.payload);
        break;
      case "voice_sdp_received":
        handleVoiceSdpReceived(event.payload);
        break;
      case "voice_ice_candidate_received":
        handleVoiceIceCandidateReceived(event.payload);
        break;
    }
  }

  async function reloadCurrentChannel() {
    const channelId = activeChannelId();
    if (!channelId || !tauriAvailable()) return;
    try {
      const msgs = await tauri.getMessages(channelId);
      setMessages(msgs);
    } catch (e) {
      console.error("failed to reload messages:", e);
    }
  }

  async function handleSendMessage(content: string) {
    const channelId = activeChannelId();
    if (!channelId) return;

    if (tauriAvailable()) {
      try {
        const msg = await tauri.sendMessage(channelId, content);
        addMessage(msg);
      } catch (e) {
        console.error("failed to send message:", e);
      }
    } else {
      const id = identity();
      addMessage({
        id: `demo_${Date.now()}`,
        channel_id: channelId,
        author_id: id?.peer_id ?? "local",
        author_name: id?.display_name ?? "you",
        content,
        timestamp: Date.now(),
        edited: false,
      });
    }
  }

  function handleTyping() {
    const channelId = activeChannelId();
    if (!channelId || !tauriAvailable()) return;
    tauri.sendTypingIndicator(channelId).catch(() => {});
  }

  async function handleSendDM(content: string) {
    const peerId = activeDMPeerId();
    if (!peerId) return;

    if (tauriAvailable()) {
      try {
        const msg = await tauri.sendDM(peerId, content);
        addDMMessage(msg);
        updateDMLastMessage(peerId, content, msg.timestamp);
      } catch (e) {
        console.error("failed to send dm:", e);
      }
    } else {
      // demo mode fallback
      const id = identity();
      const msg: DirectMessage = {
        id: `dm_${Date.now()}`,
        from_peer: id?.peer_id ?? "local",
        to_peer: peerId,
        from_display_name: id?.display_name ?? "you",
        content,
        timestamp: Date.now(),
      };
      addDMMessage(msg);
      updateDMLastMessage(peerId, content, msg.timestamp);
    }
  }

  function handleDMTyping() {
    const peerId = activeDMPeerId();
    if (!peerId || !tauriAvailable()) return;
    tauri.sendDMTyping(peerId).catch(() => {});
  }

  function handleOverlayNavigate(action: string) {
    switch (action) {
      case "create-community":
        openModal("create-community");
        break;
      case "join-community":
        openModal("join-community");
        break;
      case "settings":
        openModal("settings");
        break;
      case "directory":
        openModal("directory");
        break;
      case "home":
        setActiveCommunity(null);
        setActiveDM(null);
        break;
    }
  }

  async function handleCreateCommunity() {
    const name = newCommunityName().trim();
    const desc = newCommunityDesc().trim();
    if (!name) return;

    if (tauriAvailable()) {
      try {
        const community = await tauri.createCommunity(name, desc);
        addCommunity(community);
        // the createEffect on activeCommunityId handles loading channels, messages, members
        setActiveCommunity(community.id);
      } catch (e) {
        console.error("failed to create community:", e);
      }
    } else {
      const id = `com_demo_${Date.now()}`;
      const chId = `ch_general_${Date.now()}`;
      addCommunity({
        id,
        name,
        description: desc,
        created_by: "local",
        created_at: Date.now(),
      });
      setActiveCommunity(id);
      setChannels([
        {
          id: chId,
          community_id: id,
          name: "general",
          topic: "general discussion",
          kind: "Text",
          position: 0,
          category_id: null,
        },
      ]);
      setActiveChannel(chId);
      clearMessages();
      setMembers([
        {
          peer_id: "local",
          display_name: identity()?.display_name ?? "you",
          status: "Online",
          roles: ["owner"],
          trust_level: 1.0,
          joined_at: Date.now(),
        },
      ]);
    }

    setNewCommunityName("");
    setNewCommunityDesc("");
    closeModal();
  }

  async function handleJoinCommunity() {
    const inviteCode = joinInviteCode().trim();
    if (!inviteCode) return;

    if (tauriAvailable()) {
      try {
        const community = await tauri.joinCommunity(inviteCode);
        addCommunity(community);
        // the createEffect on activeCommunityId handles loading channels, messages, members
        setActiveCommunity(community.id);
      } catch (e) {
        console.error("failed to join community:", e);
      }
    } else {
      // demo mode - simulate joining
      const id = `com_demo_joined_${Date.now()}`;
      const chId = `ch_general_${Date.now()}`;
      addCommunity({
        id,
        name: "joined community",
        description: "a community you joined",
        created_by: "remote",
        created_at: Date.now(),
      });
      setActiveCommunity(id);
      setChannels([
        {
          id: chId,
          community_id: id,
          name: "general",
          topic: "general discussion",
          kind: "Text",
          position: 0,
          category_id: null,
        },
      ]);
      setActiveChannel(chId);
      clearMessages();
      setMembers([
        {
          peer_id: "local",
          display_name: identity()?.display_name ?? "you",
          status: "Online",
          roles: ["member"],
          trust_level: 0.5,
          joined_at: Date.now(),
        },
      ]);
    }

    setJoinInviteCode("");
    closeModal();
  }

  async function handleCreateChannel() {
    const name = newChannelName().trim();
    const topic = newChannelTopic().trim();
    const kind = newChannelKind();
    const categoryId = newChannelCategoryId();
    const communityId = activeCommunityId();
    if (!name || !communityId) return;

    if (tauriAvailable()) {
      try {
        const channel = await tauri.createChannel(
          communityId,
          name,
          topic,
          kind.toLowerCase(),
          categoryId,
        );
        setChannels((prev) => [...prev, channel]);
        // only auto-select text channels after creation
        if (channel.kind === "Text") {
          setActiveChannel(channel.id);
        }
      } catch (e) {
        console.error("failed to create channel:", e);
      }
    } else {
      // demo mode
      const chId = `ch_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
      const channel: ChannelMeta = {
        id: chId,
        community_id: communityId,
        name,
        topic: topic || `${name} discussion`,
        kind,
        position: 0,
        category_id: categoryId,
      };
      setChannels((prev) => [...prev, channel]);
      if (kind === "Text") {
        setActiveChannel(chId);
        clearMessages();
      }
    }

    setNewChannelName("");
    setNewChannelTopic("");
    setNewChannelKind("Text");
    setNewChannelCategoryId(null);
    closeModal();
  }

  async function handleCreateCategory() {
    const name = newCategoryName().trim();
    const communityId = activeCommunityId();
    if (!name || !communityId) return;

    if (tauriAvailable()) {
      try {
        const category = await tauri.createCategory(communityId, name);
        addCategory(category);
      } catch (e) {
        console.error("failed to create category:", e);
      }
    } else {
      // demo mode
      const catId = `cat_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
      addCategory({
        id: catId,
        community_id: communityId,
        name,
        position: 0,
      });
    }

    setNewCategoryName("");
    closeModal();
  }

  // generates an invite code for the active community and opens the modal
  async function handleOpenInvite() {
    const communityId = activeCommunityId();
    if (!communityId) return;

    setInviteCode("");
    setInviteCopied(false);
    setInviteLoading(true);

    if (tauriAvailable()) {
      try {
        const code = await tauri.generateInvite(communityId);
        setInviteCode(code);
      } catch (e) {
        console.error("failed to generate invite:", e);
      }
    } else {
      // demo mode - simulate invite code generation
      setInviteCode("dusk_demo_invite_" + communityId.slice(4, 16));
    }

    setInviteLoading(false);
  }

  async function handleCopyInvite() {
    const code = inviteCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // fallback for nonsecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  }

  // check if the current user is the owner of the active community
  const isCurrentUserOwner = () => {
    const id = identity();
    const memberList = members();
    if (!id) return false;
    const self = memberList.find((m) => m.peer_id === id.peer_id);
    return self?.roles.includes("owner") ?? false;
  };

  async function handleLeaveServer() {
    const communityId = activeCommunityId();
    if (!communityId) return;

    if (tauriAvailable()) {
      try {
        await tauri.leaveCommunity(communityId);
      } catch (e) {
        console.error("failed to leave community:", e);
      }
    }

    removeCommunity(communityId);
    setChannels([]);
    setCategories([]);
    setActiveChannel(null);
    clearMessages();
    setMembers([]);
    closeModal();
  }

  async function handleSaveSettings() {
    if (tauriAvailable()) {
      try {
        await tauri.saveSettings(settings());
        // also update the identity with new display name
        const current = settings();
        if (identity()?.display_name !== current.display_name) {
          await tauri.updateDisplayName(current.display_name);
          setCurrentIdentity({
            ...identity()!,
            display_name: current.display_name,
          });
        }
      } catch (e) {
        console.error("failed to save settings:", e);
      }
    }
    closeModal();
  }

  async function handleSignUpComplete(
    displayName: string,
    bio: string,
    challengeData?: ChallengeExport,
  ) {
    if (tauriAvailable()) {
      try {
        const created = await tauri.createIdentity(
          displayName,
          bio,
          challengeData,
        );
        setCurrentIdentity(created);
        updateSettings({ display_name: displayName });

        setNeedsSignUp(false);
        await initWithTauri();
        setAppReady(true);
      } catch (e) {
        console.error("failed to create identity:", e);
      }
    } else {
      // demo mode fallback
      setCurrentIdentity({
        peer_id: "12D3KooWDemo1234567890abcdef",
        display_name: displayName,
        public_key: "abcdef1234567890",
        bio,
        created_at: Date.now(),
      });
      updateSettings({ display_name: displayName });
      setNeedsSignUp(false);
      loadDemoData();
      setAppReady(true);
    }
  }

  async function handleResetIdentity() {
    if (tauriAvailable()) {
      try {
        await tauri.resetIdentity();
      } catch (e) {
        console.error("failed to reset identity:", e);
      }
    }

    // clear all in-memory state
    setCurrentIdentity(null);
    clearDirectory();
    resetSettings();
    setCommunities([]);
    setActiveCommunity(null);
    setChannels([]);
    setCategories([]);
    setActiveChannel(null);
    clearMessages();
    setMembers([]);
    setDMConversations([]);
    setActiveDM(null);
    clearDMTypingPeers();
    setPeerCount(0);
    setIsConnected(false);
    setRelayConnected(true);
    setNodeStatus("stopped");
    localStorage.removeItem("dusk_user_settings");

    // clean up event listener since the node is stopped
    cleanupEvents?.();
    cleanupEvents = undefined;

    // return to signup screen
    setAppReady(false);
    setNeedsSignUp(true);
  }

  return (
    <div class="h-screen w-screen overflow-hidden bg-black">
      <Show when={showSplash()}>
        <SplashScreen
          onComplete={() => setShowSplash(false)}
          identity={identity()}
          relayConnected={relayConnected()}
        />
      </Show>

      <Show when={needsSignUp()}>
        <SignUpScreen onComplete={handleSignUpComplete} />
      </Show>

      <Show when={appReady()}>
        <MobileNav />
        <AppLayout
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          onSendDM={handleSendDM}
          onDMTyping={handleDMTyping}
        />

        <ProfileCard />
        <ProfileModal />

        <OverlayMenu
          isOpen={overlayMenuOpen()}
          onClose={closeOverlay}
          onNavigate={handleOverlayNavigate}
        />

        <Modal
          isOpen={activeModal() === "create-community"}
          onClose={closeModal}
          title="create community"
        >
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                name
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="my community"
                value={newCommunityName()}
                onInput={(e) => setNewCommunityName(e.currentTarget.value)}
              />
            </div>
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                description
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="what's this community about?"
                value={newCommunityDesc()}
                onInput={(e) => setNewCommunityDesc(e.currentTarget.value)}
              />
            </div>
            <Button
              variant="primary"
              fullWidth
              onClick={handleCreateCommunity}
              disabled={!newCommunityName().trim()}
            >
              create
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={activeModal() === "join-community"}
          onClose={closeModal}
          title="join community"
        >
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                invite code
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="paste your invite code here"
                value={joinInviteCode()}
                onInput={(e) => setJoinInviteCode(e.currentTarget.value)}
              />
            </div>
            <Button
              variant="primary"
              fullWidth
              onClick={handleJoinCommunity}
              disabled={!joinInviteCode().trim()}
            >
              join
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={activeModal() === "create-channel"}
          onClose={closeModal}
          title="create channel"
        >
          <div class="flex flex-col gap-4">
            {/* channel type selector */}
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                type
              </label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class={`flex-1 px-4 py-3 text-[16px] border-2 transition-colors duration-200 cursor-pointer ${
                    newChannelKind() === "Text"
                      ? "border-orange bg-orange/10 text-white"
                      : "border-white/20 bg-black text-white/60 hover:border-white/40"
                  }`}
                  onClick={() => setNewChannelKind("Text")}
                >
                  text
                </button>
                <button
                  type="button"
                  class={`flex-1 px-4 py-3 text-[16px] border-2 transition-colors duration-200 cursor-pointer ${
                    newChannelKind() === "Voice"
                      ? "border-orange bg-orange/10 text-white"
                      : "border-white/20 bg-black text-white/60 hover:border-white/40"
                  }`}
                  onClick={() => setNewChannelKind("Voice")}
                >
                  voice
                </button>
              </div>
            </div>

            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                name
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="channel name"
                value={newChannelName()}
                onInput={(e) => setNewChannelName(e.currentTarget.value)}
              />
            </div>
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                topic (optional)
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="what's this channel about?"
                value={newChannelTopic()}
                onInput={(e) => setNewChannelTopic(e.currentTarget.value)}
              />
            </div>

            {/* category selector */}
            <Show when={categories().length > 0}>
              <div>
                <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                  category (optional)
                </label>
                <select
                  class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none focus:border-orange transition-colors duration-200 cursor-pointer"
                  value={newChannelCategoryId() ?? ""}
                  onChange={(e) =>
                    setNewChannelCategoryId(e.currentTarget.value || null)
                  }
                >
                  <option value="">no category</option>
                  <For each={categories()}>
                    {(cat) => <option value={cat.id}>{cat.name}</option>}
                  </For>
                </select>
              </div>
            </Show>

            <Button
              variant="primary"
              fullWidth
              onClick={handleCreateChannel}
              disabled={!newChannelName().trim()}
            >
              create
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={activeModal() === "create-category"}
          onClose={closeModal}
          title="create category"
        >
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                name
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="category name"
                value={newCategoryName()}
                onInput={(e) => setNewCategoryName(e.currentTarget.value)}
              />
            </div>
            <Button
              variant="primary"
              fullWidth
              onClick={handleCreateCategory}
              disabled={!newCategoryName().trim()}
            >
              create
            </Button>
          </div>
        </Modal>

        <SettingsModal
          isOpen={activeModal() === "settings"}
          onClose={closeModal}
          onSave={handleSaveSettings}
          onResetIdentity={handleResetIdentity}
        />

        <CommunitySettingsModal
          isOpen={activeModal() === "community-settings"}
          onClose={closeModal}
          communityId={
            (modalData() as { communityId: string } | null)?.communityId ?? null
          }
          initialSection={
            ((modalData() as { initialSection?: string } | null)
              ?.initialSection as any) ?? undefined
          }
        />

        <UserDirectoryModal
          isOpen={activeModal() === "directory"}
          onClose={closeModal}
        />

        {/* invite people modal */}
        <Modal
          isOpen={activeModal() === "invite-people"}
          onClose={closeModal}
          title="invite people"
        >
          <div class="flex flex-col gap-4">
            <p class="text-[14px] text-white/60">
              share this invite code with others so they can join{" "}
              <span class="text-white font-bold">
                {activeCommunity()?.name ?? "this server"}
              </span>
            </p>
            <Show
              when={!inviteLoading()}
              fallback={
                <div class="flex items-center justify-center py-6">
                  <span class="text-[14px] text-white/40 font-mono">
                    generating...
                  </span>
                </div>
              }
            >
              <div class="flex gap-2">
                <input
                  type="text"
                  class="flex-1 bg-black border-2 border-white/20 text-white text-[14px] font-mono px-4 py-3 outline-none select-all focus:border-orange transition-colors duration-200"
                  value={inviteCode()}
                  readOnly
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  variant={inviteCopied() ? "secondary" : "primary"}
                  onClick={handleCopyInvite}
                >
                  {inviteCopied() ? "copied" : "copy"}
                </Button>
              </div>
            </Show>
            <p class="text-[12px] text-white/30 font-mono">
              invite codes never contain IP addresses. peers discover each other
              through the relay.
            </p>
          </div>
        </Modal>

        {/* leave server confirmation modal */}
        <Modal
          isOpen={activeModal() === "leave-server"}
          onClose={closeModal}
          title="leave server"
        >
          <Show
            when={isCurrentUserOwner()}
            fallback={
              <div class="flex flex-col gap-6">
                <p class="text-[14px] text-white/60">
                  are you sure you want to leave{" "}
                  <span class="text-white font-bold">
                    {activeCommunity()?.name ?? "this server"}
                  </span>
                  ? you can rejoin later with a new invite code.
                </p>
                <div class="flex gap-3 justify-end">
                  <Button variant="secondary" onClick={closeModal}>
                    cancel
                  </Button>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center h-12 px-6 text-[14px] font-medium uppercase tracking-[0.05em] bg-red-500 text-white border-none hover:bg-red-600 hover:scale-[0.98] active:scale-[0.96] transition-all duration-200 cursor-pointer select-none"
                    onClick={handleLeaveServer}
                  >
                    leave server
                  </button>
                </div>
              </div>
            }
          >
            <div class="flex flex-col gap-6">
              <div class="p-4 bg-orange/10 border-2 border-orange/30">
                <div class="flex items-start gap-3">
                  <AlertTriangle
                    size={20}
                    class="text-orange mt-0.5 shrink-0"
                  />
                  <div>
                    <p class="text-[14px] text-white font-medium">
                      you are the owner of{" "}
                      <span class="text-orange font-bold">
                        {activeCommunity()?.name ?? "this server"}
                      </span>
                    </p>
                    <p class="text-[13px] text-white/50 mt-1">
                      if you leave without transferring ownership, no one will
                      have owner permissions. consider transferring ownership to
                      another member first.
                    </p>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-3">
                <button
                  type="button"
                  class="w-full h-12 text-[14px] font-medium uppercase tracking-[0.05em] bg-orange text-black hover:bg-orange/90 hover:scale-[0.98] active:scale-[0.96] transition-all duration-200 cursor-pointer select-none"
                  onClick={() => {
                    closeModal();
                    openModal("community-settings", {
                      communityId: activeCommunityId(),
                      initialSection: "members",
                    });
                  }}
                >
                  transfer ownership
                </button>
                <button
                  type="button"
                  class="w-full h-12 text-[14px] font-medium uppercase tracking-[0.05em] bg-red-500 text-white border-none hover:bg-red-600 hover:scale-[0.98] active:scale-[0.96] transition-all duration-200 cursor-pointer select-none"
                  onClick={handleLeaveServer}
                >
                  leave anyway
                </button>
                <Button variant="secondary" onClick={closeModal}>
                  cancel
                </Button>
              </div>
            </div>
          </Show>
        </Modal>
      </Show>
    </div>
  );
};

// populate stores with realistic static data for browser development
function loadDemoData() {
  const now = Date.now();

  setCurrentIdentity({
    peer_id: "12D3KooWDemo1234567890abcdef",
    display_name: "user",
    public_key: "abcdef1234567890",
    bio: "",
    created_at: now - 86400000 * 30,
  });

  setCommunities([
    {
      id: "com_demo_001",
      name: "dusk dev",
      description: "development community for dusk",
      created_by: "12D3KooWDemo1234567890abcdef",
      created_at: now - 86400000 * 7,
    },
    {
      id: "com_demo_002",
      name: "rust p2p",
      description: "peer-to-peer networking in rust",
      created_by: "12D3KooWPeer_alice",
      created_at: now - 86400000 * 14,
    },
  ]);

  setActiveCommunity("com_demo_001");

  setChannels([
    {
      id: "ch_general_001",
      community_id: "com_demo_001",
      name: "general",
      topic: "general discussion about dusk development",
      kind: "Text",
      position: 0,
      category_id: null,
    },
    {
      id: "ch_design_001",
      community_id: "com_demo_001",
      name: "design",
      topic: "UI/UX design discussion",
      kind: "Text",
      position: 1,
      category_id: null,
    },
    {
      id: "ch_voice_001",
      community_id: "com_demo_001",
      name: "voice",
      topic: "",
      kind: "Voice",
      position: 0,
      category_id: null,
    },
  ]);

  setActiveChannel("ch_general_001");

  setMessages([
    {
      id: "msg_001",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_alice",
      author_name: "alice",
      content:
        "just got the libp2p node running on my machine. peer discovery over mdns works perfectly on LAN.",
      timestamp: now - 3600000 * 2,
      edited: false,
    },
    {
      id: "msg_002",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_bob",
      author_name: "bob",
      content: "nice! how's the gossipsub performance? any message drops?",
      timestamp: now - 3600000 * 2 + 60000,
      edited: false,
    },
    {
      id: "msg_003",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_alice",
      author_name: "alice",
      content:
        "zero drops so far with 3 peers on the mesh. the heartbeat interval at 1s keeps things responsive.",
      timestamp: now - 3600000 * 2 + 120000,
      edited: false,
    },
    {
      id: "msg_004",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_alice",
      author_name: "alice",
      content:
        "the automerge sync is also working well for catch-up after reconnection",
      timestamp: now - 3600000 * 2 + 180000,
      edited: false,
    },
    {
      id: "msg_005",
      channel_id: "ch_general_001",
      author_id: "12D3KooWDemo1234567890abcdef",
      author_name: "user",
      content:
        "this is looking great. the CRDT approach means we never have to worry about message ordering conflicts.",
      timestamp: now - 3600000,
      edited: false,
    },
    {
      id: "msg_006",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_charlie",
      author_name: "charlie",
      content:
        "been testing NAT traversal with hole punching. works about 70% of the time which matches the libp2p docs estimates.",
      timestamp: now - 1800000,
      edited: false,
    },
    {
      id: "msg_007",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_bob",
      author_name: "bob",
      content:
        "for the remaining 30% we'll need TURN relay fallback. but that's a phase 3 concern.",
      timestamp: now - 1800000 + 30000,
      edited: false,
    },
    {
      id: "msg_008",
      channel_id: "ch_general_001",
      author_id: "12D3KooWPeer_charlie",
      author_name: "charlie",
      content:
        "agreed. the three-tier topology design should handle that gracefully when we get there.",
      timestamp: now - 1800000 + 60000,
      edited: false,
    },
  ]);

  setMembers([
    {
      peer_id: "12D3KooWDemo1234567890abcdef",
      display_name: "user",
      status: "Online",
      roles: ["owner"],
      trust_level: 1.0,
      joined_at: now - 86400000 * 7,
    },
    {
      peer_id: "12D3KooWPeer_alice",
      display_name: "alice",
      status: "Online",
      roles: ["admin"],
      trust_level: 0.95,
      joined_at: now - 86400000 * 6,
    },
    {
      peer_id: "12D3KooWPeer_bob",
      display_name: "bob",
      status: "Idle",
      roles: ["member"],
      trust_level: 0.8,
      joined_at: now - 86400000 * 5,
    },
    {
      peer_id: "12D3KooWPeer_charlie",
      display_name: "charlie",
      status: "Online",
      roles: ["member"],
      trust_level: 0.75,
      joined_at: now - 86400000 * 3,
    },
    {
      peer_id: "12D3KooWPeer_diana",
      display_name: "diana",
      status: "Offline",
      roles: ["member"],
      trust_level: 0.6,
      joined_at: now - 86400000 * 2,
    },
  ]);

  // seed dm conversations so the home screen has content
  setDMConversations([
    {
      peer_id: "12D3KooWPeer_alice",
      display_name: "alice",
      last_message: "the gossipsub refactor is merged, check it out",
      last_message_time: now - 600000,
      unread_count: 2,
    },
    {
      peer_id: "12D3KooWPeer_bob",
      display_name: "bob",
      last_message: "sure, i'll review the PR tonight",
      last_message_time: now - 3600000,
      unread_count: 0,
    },
    {
      peer_id: "12D3KooWPeer_charlie",
      display_name: "charlie",
      last_message: "NAT traversal test results look promising",
      last_message_time: now - 7200000,
      unread_count: 1,
    },
    {
      peer_id: "12D3KooWPeer_diana",
      display_name: "diana",
      last_message: "offline, will catch up tomorrow",
      last_message_time: now - 86400000,
      unread_count: 0,
    },
  ]);

  // seed the user directory with known peers
  setKnownPeers([
    {
      peer_id: "12D3KooWPeer_alice",
      display_name: "alice",
      bio: "distributed systems engineer. libp2p contributor.",
      public_key: "alice_pubkey_hex",
      last_seen: now - 600000,
      is_friend: true,
    },
    {
      peer_id: "12D3KooWPeer_bob",
      display_name: "bob",
      bio: "rust developer, crdt enthusiast",
      public_key: "bob_pubkey_hex",
      last_seen: now - 3600000,
      is_friend: true,
    },
    {
      peer_id: "12D3KooWPeer_charlie",
      display_name: "charlie",
      bio: "networking and NAT traversal research",
      public_key: "charlie_pubkey_hex",
      last_seen: now - 7200000,
      is_friend: false,
    },
    {
      peer_id: "12D3KooWPeer_diana",
      display_name: "diana",
      bio: "",
      public_key: "diana_pubkey_hex",
      last_seen: now - 86400000,
      is_friend: false,
    },
    {
      peer_id: "12D3KooWPeer_eve",
      display_name: "eve",
      bio: "cryptography researcher, privacy advocate",
      public_key: "eve_pubkey_hex",
      last_seen: now - 172800000,
      is_friend: false,
    },
  ]);

  // seed friends list
  setFriends([
    {
      peer_id: "12D3KooWPeer_alice",
      display_name: "alice",
      bio: "distributed systems engineer. libp2p contributor.",
      public_key: "alice_pubkey_hex",
      last_seen: now - 600000,
      is_friend: true,
    },
    {
      peer_id: "12D3KooWPeer_bob",
      display_name: "bob",
      bio: "rust developer, crdt enthusiast",
      public_key: "bob_pubkey_hex",
      last_seen: now - 3600000,
      is_friend: true,
    },
  ]);
}

export default App;
