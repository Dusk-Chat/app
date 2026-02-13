import { createSignal, onMount, onCleanup, type JSX, type Component } from "solid-js";

interface ResizablePanelProps {
  width: number;
  minWidth?: number;
  maxWidth?: number;
  side: "left" | "right";
  children: JSX.Element;
  onResize?: (width: number) => void;
}

const ResizablePanel: Component<ResizablePanelProps> = (props) => {
  const [isResizing, setIsResizing] = createSignal(false);
  const [currentWidth, setCurrentWidth] = createSignal(props.width);
  let containerRef: HTMLDivElement | undefined;

  const minWidth = props.minWidth ?? 150;
  const maxWidth = props.maxWidth ?? 500;

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing() || !containerRef) return;

    const containerRect = containerRef.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    let newWidth: number;

    if (props.side === "left") {
      newWidth = e.clientX - containerRect.left;
    } else {
      newWidth = containerRect.right - e.clientX;
    }

    // clamp the width between min and max
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setCurrentWidth(newWidth);
    props.onResize?.(newWidth);
  }

  function handleMouseUp() {
    if (isResizing()) {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }

  onMount(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });

  onCleanup(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  });

  return (
    <div
      ref={containerRef}
      class="relative flex shrink-0"
      style={{ width: `${currentWidth()}px` }}
    >
      <div class="flex-1 overflow-hidden">
        {props.children}
      </div>
      
      {/* resize handle */}
      <div
        class={`absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-orange/50 transition-colors ${
          props.side === "left" ? "right-0" : "left-0"
        } ${isResizing() ? "bg-orange" : ""}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

export default ResizablePanel;
