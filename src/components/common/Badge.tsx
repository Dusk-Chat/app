import type { Component } from "solid-js";
import { Show } from "solid-js";

interface BadgeProps {
  count: number;
  pulse?: boolean;
}

const Badge: Component<BadgeProps> = (props) => {
  return (
    <Show when={props.count > 0}>
      <div
        class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-orange text-white text-[11px] font-medium rounded-full animate-pop-in"
        style={
          props.pulse
            ? { animation: "pop-in 300ms ease-out, badge-pulse 3s ease-in-out 300ms infinite" }
            : undefined
        }
      >
        {props.count > 99 ? "99+" : props.count}
      </div>
    </Show>
  );
};

export default Badge;
