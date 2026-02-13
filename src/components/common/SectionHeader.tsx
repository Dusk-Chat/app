import type { Component } from "solid-js";
import { Show } from "solid-js";
import { ChevronDown } from "lucide-solid";

interface SectionHeaderProps {
  label: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

const SectionHeader: Component<SectionHeaderProps> = (props) => {
  return (
    <button
      type="button"
      class="flex items-center gap-1 w-full px-2 py-1.5 text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 hover:text-white/80 transition-colors duration-200 cursor-pointer select-none"
      onClick={props.onToggle}
    >
      <Show when={props.collapsible}>
        <ChevronDown
          size={12}
          class="transition-transform duration-300"
          style={{
            transform: props.collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        />
      </Show>
      {props.label}
    </button>
  );
};

export default SectionHeader;
