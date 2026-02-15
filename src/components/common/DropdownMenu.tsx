import type { Component } from "solid-js";
import { For, Show, onMount, onCleanup, createSignal } from "solid-js";
import { Portal, Dynamic } from "solid-js/web";

export interface DropdownItem {
  label: string;
  icon?: Component<{ size?: number; class?: string }>;
  onClick: () => void;
  // visually distinct destructive action (red text)
  destructive?: boolean;
  // divider rendered above this item
  dividerAbove?: boolean;
}

interface DropdownMenuProps {
  items: DropdownItem[];
  isOpen: boolean;
  onClose: () => void;
  // anchor element ref for positioning
  anchorRef?: HTMLElement;
}

const DropdownMenu: Component<DropdownMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [position, setPosition] = createSignal({ top: 0, left: 0 });

  // recompute position whenever the dropdown opens
  const updatePosition = () => {
    if (!props.anchorRef || !menuRef) return;
    const rect = props.anchorRef.getBoundingClientRect();
    // position directly below the anchor, aligned to the left edge
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
    });
  };

  // close on outside click
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      props.onClose();
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleKeydown);
  });

  // recalculate on open
  const isOpen = () => {
    if (props.isOpen) {
      // defer to let the element render first
      requestAnimationFrame(updatePosition);
    }
    return props.isOpen;
  };

  return (
    <Show when={isOpen()}>
      <Portal>
        <div
          ref={menuRef}
          class="fixed z-999 min-w-50 bg-gray-900 border border-white/10 shadow-xl animate-fade-in py-1"
          style={{
            top: `${position().top}px`,
            left: `${position().left}px`,
          }}
        >
          <For each={props.items}>
            {(item) => (
              <>
                <Show when={item.dividerAbove}>
                  <div class="h-px bg-white/10 my-1" />
                </Show>
                <button
                  type="button"
                  class={`flex items-center gap-2.5 w-full px-3 py-2 text-[14px] text-left transition-colors duration-150 cursor-pointer ${
                    item.destructive
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => {
                    item.onClick();
                    props.onClose();
                  }}
                >
                  <Show when={item.icon}>
                    <Dynamic component={item.icon} size={16} class="shrink-0" />
                  </Show>
                  {item.label}
                </button>
              </>
            )}
          </For>
        </div>
      </Portal>
    </Show>
  );
};

export default DropdownMenu;
