import type { Component, JSX } from "solid-js";

interface IconButtonProps {
  children: JSX.Element;
  label: string;
  size?: number;
  onClick?: () => void;
  active?: boolean;
  class?: string;
}

const IconButton: Component<IconButtonProps> = (props) => {
  const px = () => props.size ?? 40;

  return (
    <button
      type="button"
      aria-label={props.label}
      class={`inline-flex items-center justify-center shrink-0 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer ${
        props.active
          ? "bg-orange text-white"
          : "bg-gray-800 text-white/60 hover:bg-orange hover:text-white"
      } ${props.class ?? ""}`}
      style={{ width: `${px()}px`, height: `${px()}px` }}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
};

export default IconButton;
