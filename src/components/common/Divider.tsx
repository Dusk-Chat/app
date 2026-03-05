import type { Component } from "solid-js";

const Divider: Component<{ class?: string }> = (props) => {
  return (
    <div
      role="separator"
      class={`w-full h-px shrink-0 bg-white/10 ${props.class ?? ""}`}
    />
  );
};

export default Divider;
