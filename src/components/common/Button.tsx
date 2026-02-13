import type { JSX, Component } from "solid-js";

interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  fullWidth?: boolean;
  children: JSX.Element;
  onClick?: () => void;
  class?: string;
  type?: "button" | "submit";
}

const Button: Component<ButtonProps> = (props) => {
  const variant = () => props.variant ?? "primary";
  const size = () => props.size ?? "md";

  const baseStyles =
    "inline-flex items-center justify-center font-medium uppercase tracking-[0.05em] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer select-none";

  const variantStyles = () => {
    switch (variant()) {
      case "primary":
        return "bg-orange text-white border-none hover:bg-orange-hover hover:scale-[0.98] active:scale-[0.96]";
      case "secondary":
        return "bg-transparent border-2 border-white text-white hover:bg-white hover:text-black";
      case "ghost":
        return "bg-transparent border-none text-white/60 hover:text-white";
      default:
        return "";
    }
  };

  const sizeStyles = () => {
    switch (size()) {
      case "sm":
        return "h-8 px-4 text-[12px]";
      case "md":
        return "h-12 px-6 text-[14px]";
      case "lg":
        return "h-14 px-8 text-[16px]";
      default:
        return "";
    }
  };

  return (
    <button
      type={props.type ?? "button"}
      class={`${baseStyles} ${variantStyles()} ${sizeStyles()} ${props.fullWidth ? "w-full" : ""} ${props.disabled ? "opacity-40 pointer-events-none" : ""} ${props.class ?? ""}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
};

export default Button;
