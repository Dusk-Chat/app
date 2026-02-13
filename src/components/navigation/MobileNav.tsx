import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Menu, Hash } from "lucide-solid";
import { openOverlay, isMobile } from "../../stores/ui";
import { activeChannel } from "../../stores/channels";

const MobileNav: Component = () => {
  return (
    <Show when={isMobile()}>
      <div class="h-15 shrink-0 flex items-center justify-between px-4 bg-gray-900 border-b border-white/10 pt-3">
        <button
          type="button"
          class="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors duration-200 cursor-pointer"
          onClick={openOverlay}
        >
          <Menu size={24} />
        </button>

        <div class="flex items-center gap-2">
          <Show when={activeChannel()}>
            <Hash size={16} class="text-white/40" />
            <span class="text-[16px] font-medium text-white">
              {activeChannel()!.name}
            </span>
          </Show>
        </div>

        {/* spacer to balance the hamburger */}
        <div class="w-10" />
      </div>
    </Show>
  );
};

export default MobileNav;
