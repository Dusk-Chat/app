import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Hash, Pin, Search, Users } from "lucide-solid";
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

interface AppLayoutProps {
  onSendMessage: (content: string) => void;
  onTyping: () => void;
  onSendDM: (content: string) => void;
}

const AppLayout: Component<AppLayoutProps> = (props) => {
  // whether home is active (no community selected)
  const isHome = () => activeCommunityId() === null;
  const channel = () => activeChannel();
  const showSidebar = () => sidebarVisible() && !isMobile() && !isHome();
  const showChannelHeader = () => !isHome() && channel();

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-black">
      {/* server list - always visible on desktop/tablet, horizontal on mobile */}
      <Show when={!isMobile()}>
        <ServerList />
      </Show>

      {/* main content area */}
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
            <DMChatArea onSendDM={props.onSendDM} />
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default AppLayout;
