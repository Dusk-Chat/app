import type { Component } from "solid-js";

const Divider: Component<{ class?: string }> = (props) => {
  return (
    <div
      class={`w-full border-t border-white/10 ${props.class ?? ""}`}
    />
  );
};

export default Divider;
