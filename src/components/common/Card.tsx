import type { Component, JSX } from "solid-js";

interface CardProps {
  children: JSX.Element;
  class?: string;
}

const Card: Component<CardProps> = (props) => {
  return (
    <div
      class={`bg-gray-900 border-2 border-white/20 p-8 hover:border-white/40 transition-colors duration-200 ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
};

export default Card;
