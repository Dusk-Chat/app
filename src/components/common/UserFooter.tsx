import {
  Show,
  createSignal,
  onMount,
  onCleanup,
  type Component,
  For,
} from "solid-js";
import { Settings } from "lucide-solid";
import { identity } from "../../stores/identity";
import { settings, updateStatus } from "../../stores/settings";
import type { UserStatus } from "../../lib/types";
import Avatar from "../common/Avatar";

interface UserFooterProps {
  showSettings?: boolean;
  onSettingsClick?: () => void;
}

const UserFooter: Component<UserFooterProps> = (props) => {
  const user = () => identity();
  const currentSettings = settings;
  const [isOpen, setIsOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let triggerRef: HTMLDivElement | undefined;

  const statusOptions: { label: string; value: UserStatus }[] = [
    { label: "online", value: "online" },
    { label: "idle", value: "idle" },
    { label: "do not disturb", value: "dnd" },
    { label: "invisible", value: "invisible" },
  ];

  function toggleMenu() {
    setIsOpen(!isOpen());
  }

  function handleStatusChange(status: UserStatus) {
    updateStatus(status);
    setIsOpen(false);
  }

  // click outside handler
  function handleClickOutside(e: MouseEvent) {
    if (
      isOpen() &&
      menuRef &&
      !menuRef.contains(e.target as Node) &&
      triggerRef &&
      !triggerRef.contains(e.target as Node)
    ) {
      setIsOpen(false);
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  return (
    <div class="h-16 shrink-0 flex items-center gap-3 px-3 bg-black border-t border-white/10 relative">
      <Show when={user()}>
        <div
          ref={triggerRef}
          class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:bg-white/5 p-2 -ml-2 transition-colors relative select-none"
          onClick={toggleMenu}
        >
          <Avatar
            name={user()!.display_name}
            size="sm"
            status={currentSettings().status}
            showStatus
          />
          <div class="flex-1 min-w-0">
            <p class="text-[14px] font-medium text-white truncate">
              {user()!.display_name}
            </p>
            <p class="text-[11px] font-mono text-white/30 truncate">
              {currentSettings().status}
            </p>
          </div>
        </div>

        <Show when={isOpen()}>
          <div
            ref={menuRef}
            class="absolute bottom-full left-3 mb-2 w-48 bg-black border border-white/10 shadow-xl overflow-hidden z-50 animate-fade-in"
          >
            <div class="p-1">
              <For each={statusOptions}>
                {(option) => (
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 text-[13px] text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(option.value);
                    }}
                  >
                    <div
                      class={`w-2 h-2 ${
                        option.value === "online"
                          ? "bg-success"
                          : option.value === "idle"
                            ? "bg-warning"
                            : option.value === "dnd"
                              ? "bg-error"
                              : "bg-gray-500"
                      }`}
                    />
                    {option.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={props.showSettings}>
          <button
            type="button"
            class="text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
            onClick={props.onSettingsClick}
          >
            <Settings size={16} />
          </button>
        </Show>
      </Show>
    </div>
  );
};

export default UserFooter;
