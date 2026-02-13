import type { Component, JSX } from "solid-js";
import { Show, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { X } from "lucide-solid";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: JSX.Element;
}

const Modal: Component<ModalProps> = (props) => {
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onClose();
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div
          class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 animate-fade-in"
          onClick={handleBackdropClick}
        >
          <div class="bg-gray-900 border-2 border-white/20 p-8 w-full max-w-[480px] mx-4 animate-scale-in relative">
            <button
              type="button"
              class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors duration-200 cursor-pointer"
              onClick={props.onClose}
            >
              <X size={20} />
            </button>

            <h2 class="text-[24px] leading-[32px] font-bold text-white mb-6">
              {props.title}
            </h2>

            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default Modal;
