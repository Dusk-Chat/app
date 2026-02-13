import type { Component } from "solid-js";
import { For, Show, onMount, onCleanup } from "solid-js";
import { X } from "lucide-solid";

interface OverlayMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (action: string) => void;
}

const menuItems = [
  { label: "home", action: "home" },
  { label: "user directory", action: "directory" },
  { label: "create community", action: "create-community" },
  { label: "join community", action: "join-community" },
  { label: "settings", action: "settings" },
];

const OverlayMenu: Component<OverlayMenuProps> = (props) => {
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose();
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-[1000] bg-black flex flex-col animate-fade-in">
        {/* close button */}
        <div class="flex justify-end p-6">
          <button
            type="button"
            class="w-12 h-12 flex items-center justify-center text-white hover:text-orange transition-colors duration-200 cursor-pointer"
            onClick={props.onClose}
          >
            <X size={32} />
          </button>
        </div>

        {/* menu items */}
        <div class="flex-1 flex flex-col justify-center px-12">
          <For each={menuItems}>
            {(item, index) => (
              <button
                type="button"
                class="text-left text-[48px] font-bold text-white hover:text-orange hover:translate-x-4 transition-all duration-200 py-2 cursor-pointer animate-slide-in-left"
                style={{ "animation-delay": `${index() * 100}ms` }}
                onClick={() => {
                  props.onNavigate(item.action);
                  props.onClose();
                }}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

export default OverlayMenu;
