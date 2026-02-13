import { Component, onMount, onCleanup, createSignal, Show } from "solid-js";
import AppLayout from "./components/layout/AppLayout";
import OverlayMenu from "./components/navigation/OverlayMenu";
import MobileNav from "./components/navigation/MobileNav";
import Modal from "./components/common/Modal";
import Button from "./components/common/Button";
import SettingsModal from "./components/settings/SettingsModal";
import SignUpScreen from "./components/auth/SignUpScreen";
import UserDirectoryModal from "./components/directory/UserDirectoryModal";

import {
  overlayMenuOpen,
  closeOverlay,
  activeModal,
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
} from "./stores/communities";
import {
  setChannels,
  setActiveChannel,
  activeChannelId,
} from "./stores/channels";
import {
  addMessage,
  setMessages,
  clearMessages,
  removeMessage,
} from "./stores/messages";
import {
  setMembers,
  addTypingPeer,
  setPeerOnline,
  setPeerOffline,
  removeMember,
} from "./stores/members";
import {
  setPeerCount,
  setNodeStatus,
  setIsConnected,
} from "./stores/connection";
import {
  setDMConversations,
  activeDMPeerId,
  addDMMessage,
  setActiveDM,
  updateDMLastMessage,
} from "./stores/dms";
import {
  setKnownPeers,
  setFriends,
  updatePeerProfile,
  removePeer,
  clearDirectory,
} from "./stores/directory";

import * as tauri from "./lib/tauri";
import type { DuskEvent } from "./lib/types";
import { resetSettings } from "./stores/settings";

const App: Component = () => {
  let cleanupResize: (() => void) | undefined;
  let cleanupEvents: (() => void) | undefined;

  const [tauriAvailable, setTauriAvailable] = createSignal(false);
  const [needsSignUp, setNeedsSignUp] = createSignal(false);
  const [appReady, setAppReady] = createSignal(false);
  const [newCommunityName, setNewCommunityName] = createSignal("");
  const [newCommunityDesc, setNewCommunityDesc] = createSignal("");
  const [joinInviteCode, setJoinInviteCode] = createSignal("");
  const [newChannelName, setNewChannelName] = createSignal("");
  const [newChannelTopic, setNewChannelTopic] = createSignal("");

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

      // load the peer directory and friends list
      try {
        const peers = await tauri.getKnownPeers();
        setKnownPeers(peers);
        const friendsList = await tauri.getFriends();
        setFriends(friendsList);
      } catch {
        // directory not populated yet, that's fine
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

      if (communities.length > 0) {
        setActiveCommunity(communities[0].id);
        const channels = await tauri.getChannels(communities[0].id);
        setChannels(channels);

        if (channels.length > 0) {
          setActiveChannel(channels[0].id);
          const messages = await tauri.getMessages(channels[0].id);
          setMessages(messages);
        }

        const members = await tauri.getMembers(communities[0].id);
        setMembers(members);
      }
    } catch (e) {
      console.error("initialization error:", e);
      setNodeStatus("error");
    }
  }

  function handleDuskEvent(event: DuskEvent) {
    switch (event.kind) {
      case "message_received":
        if (event.payload.channel_id === activeChannelId()) {
          addMessage(event.payload);
        }
        break;
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
        );
        break;
      case "profile_revoked":
        // peer revoked their identity, remove them from our local directory
        removePeer(event.payload.peer_id);
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

  function handleSendDM(content: string) {
    const peerId = activeDMPeerId();
    if (!peerId) return;

    const id = identity();
    const msg = {
      id: `dm_${Date.now()}`,
      channel_id: `dm_${peerId}`,
      author_id: id?.peer_id ?? "local",
      author_name: id?.display_name ?? "you",
      content,
      timestamp: Date.now(),
      edited: false,
    };

    addDMMessage(msg);
    updateDMLastMessage(peerId, content, msg.timestamp);
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
        setActiveCommunity(community.id);

        const channels = await tauri.getChannels(community.id);
        setChannels(channels);
        if (channels.length > 0) {
          setActiveChannel(channels[0].id);
          clearMessages();
        }

        const members = await tauri.getMembers(community.id);
        setMembers(members);
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
        setActiveCommunity(community.id);

        const channels = await tauri.getChannels(community.id);
        setChannels(channels);
        if (channels.length > 0) {
          setActiveChannel(channels[0].id);
          clearMessages();
        }

        const members = await tauri.getMembers(community.id);
        setMembers(members);
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
    const communityId = activeCommunityId();
    if (!name || !communityId) return;

    if (tauriAvailable()) {
      try {
        const channel = await tauri.createChannel(communityId, name, topic);
        setChannels((prev) => [...prev, channel]);
        setActiveChannel(channel.id);
        clearMessages();
      } catch (e) {
        console.error("failed to create channel:", e);
      }
    } else {
      // demo mode
      const chId = `ch_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
      const channel = {
        id: chId,
        community_id: communityId,
        name,
        topic: topic || `${name} discussion`,
        kind: "Text" as const,
      };
      setChannels((prev) => [...prev, channel]);
      setActiveChannel(chId);
      clearMessages();
    }

    setNewChannelName("");
    setNewChannelTopic("");
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

  async function handleSignUpComplete(displayName: string, bio: string) {
    if (tauriAvailable()) {
      try {
        const created = await tauri.createIdentity(displayName, bio);
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
    setActiveChannel(null);
    clearMessages();
    setMembers([]);
    setDMConversations([]);
    setActiveDM(null);
    setPeerCount(0);
    setIsConnected(false);
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
      <Show when={needsSignUp()}>
        <SignUpScreen onComplete={handleSignUpComplete} />
      </Show>

      <Show when={appReady()}>
        <MobileNav />
        <AppLayout
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          onSendDM={handleSendDM}
        />

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

        <SettingsModal
          isOpen={activeModal() === "settings"}
          onClose={closeModal}
          onSave={handleSaveSettings}
          onResetIdentity={handleResetIdentity}
        />

        <UserDirectoryModal
          isOpen={activeModal() === "directory"}
          onClose={closeModal}
        />
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
    },
    {
      id: "ch_design_001",
      community_id: "com_demo_001",
      name: "design",
      topic: "UI/UX design discussion",
      kind: "Text",
    },
    {
      id: "ch_voice_001",
      community_id: "com_demo_001",
      name: "voice",
      topic: "",
      kind: "Voice",
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
      status: "Online",
      last_message: "the gossipsub refactor is merged, check it out",
      last_message_time: now - 600000,
      unread_count: 2,
    },
    {
      peer_id: "12D3KooWPeer_bob",
      display_name: "bob",
      status: "Idle",
      last_message: "sure, i'll review the PR tonight",
      last_message_time: now - 3600000,
      unread_count: 0,
    },
    {
      peer_id: "12D3KooWPeer_charlie",
      display_name: "charlie",
      status: "Online",
      last_message: "NAT traversal test results look promising",
      last_message_time: now - 7200000,
      unread_count: 1,
    },
    {
      peer_id: "12D3KooWPeer_diana",
      display_name: "diana",
      status: "Offline",
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
