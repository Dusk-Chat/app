import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Hash, Pin, Search, Users, WifiOff } from "lucide-solid";
import ServerList from "./ServerList";
import ChannelList from "./ChannelList";
import ChatArea from "./ChatArea";
import DMSidebar from "./DMSidebar";
import HomeView from "./HomeView";
import DMChatArea from "./DMChatArea";
import UserSidebar from "./UserSidebar";
import ResizablePanel from "../common/ResizablePanel";
import IconButton from "../common/IconButton";
import {
  sidebarVisible,
  channelListVisible,
  isMobile,
  toggleSidebar,
} from "../../stores/ui";
import { activeCommunityId } from "../../stores/communities";
import { activeDMPeerId } from "../../stores/dms";
import { activeChannel } from "../../stores/channels";
import { sidebarWidth, updateSidebarWidth } from "../../stores/sidebar";
import { relayConnected, nodeStatus } from "../../stores/connection";

interface AppLayoutProps {
  onSendMessage: (content: string) => void;
  onTyping: () => void;
  onSendDM: (content: string) => void;
  onDMTyping: () => void;
}

const AppLayout: Component<AppLayoutProps> = (props) => {
  // whether home is active (no community selected)
  const isHome = () => activeCommunityId() === null;
  const channel = () => activeChannel();
  const showSidebar = () => sidebarVisible() && !isMobile() && !isHome();
  const showChannelHeader = () => !isHome() && channel();
  // only warn about relay when the node is actually running
  const showRelayWarning = () =>
    !relayConnected() && nodeStatus() === "running";

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-black">
      {/* server list - always visible on desktop/tablet, horizontal on mobile */}
      <Show when={!isMobile()}>
        <ServerList />
      </Show>

      {/* main content area */}
      <div class="flex flex-col flex-1 overflow-hidden min-w-0">
        <Show when={showRelayWarning()}>
          <div class="shrink-0 flex items-center gap-2 px-4 py-2 bg-orange/10 border-b border-orange/20">
            <WifiOff size={14} class="shrink-0 text-orange" />
            <span class="text-[13px] font-mono text-orange">
              relay unreachable -- WAN connectivity limited, retrying in
              background
            </span>
          </div>
        </Show>

        <div class="flex flex-1 overflow-hidden min-w-0">
          <Show
            when={isHome()}
            fallback={
              <>
                {/* community view: channel list + chat */}
                <Show when={channelListVisible()}>
                  <ResizablePanel
                    width={sidebarWidth()}
                    minWidth={300}
                    maxWidth={600}
                    side="left"
                    onResize={updateSidebarWidth}
                  >
                    <ChannelList />
                  </ResizablePanel>
                </Show>

                {/* chat + header container */}
                <div class="flex flex-col flex-1 min-w-0">
                  {/* channel header */}
                  <Show when={showChannelHeader()}>
                    <div class="h-15 shrink-0 border-b border-white/10 bg-black flex flex-col justify-end">
                      <div class="h-12 flex items-center justify-between px-4">
                        <div class="flex items-center gap-2 min-w-0">
                          <Hash size={20} class="shrink-0 text-white/40" />
                          <span class="text-[16px] font-bold text-white truncate">
                            {channel()!.name}
                          </span>
                          <Show when={channel()!.topic}>
                            <div class="w-px h-5 bg-white/20 mx-2 shrink-0" />
                            <span class="text-[14px] text-white/40 truncate">
                              {channel()!.topic}
                            </span>
                          </Show>
                        </div>

                        <div class="flex items-center gap-1 shrink-0">
                          <IconButton label="Pinned messages">
                            <Pin size={18} />
                          </IconButton>
                          <IconButton label="Search">
                            <Search size={18} />
                          </IconButton>
                          <IconButton
                            label="Toggle member list"
                            active={sidebarVisible()}
                            onClick={toggleSidebar}
                          >
                            <Users size={18} />
                          </IconButton>
                        </div>
                      </div>
                    </div>
                  </Show>

                  <div class="flex flex-1 min-w-0">
                    <ChatArea
                      onSendMessage={props.onSendMessage}
                      onTyping={props.onTyping}
                    />
                    <Show when={showSidebar()}>
                      <ResizablePanel
                        width={sidebarWidth()}
                        minWidth={300}
                        maxWidth={600}
                        side="right"
                        onResize={updateSidebarWidth}
                      >
                        <UserSidebar />
                      </ResizablePanel>
                    </Show>
                  </div>
                </div>
              </>
            }
          >
            {/* home view: dm sidebar + friends list or dm chat */}
            <ResizablePanel
              width={sidebarWidth()}
              minWidth={300}
              maxWidth={600}
              side="left"
              onResize={updateSidebarWidth}
            >
              <DMSidebar />
            </ResizablePanel>
            <Show when={activeDMPeerId()} fallback={<HomeView />}>
              <DMChatArea
                onSendDM={props.onSendDM}
                onTyping={props.onDMTyping}
              />
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
