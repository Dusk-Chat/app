import {
  Component,
  createSignal,
  createEffect,
  onMount,
  Show,
  onCleanup,
} from "solid-js";
import type { PublicIdentity } from "../../lib/types";
import { checkInternetConnectivity } from "../../lib/tauri";

interface SplashScreenProps {
  onComplete: () => void;
  identity: PublicIdentity | null;
  relayConnected: boolean;
}

const SplashScreen: Component<SplashScreenProps> = (props) => {
  const [fading, setFading] = createSignal(false);
  const [animationComplete, setAnimationComplete] = createSignal(false);
  const [showWelcome, setShowWelcome] = createSignal(false);
  const [svgMounted, setSvgMounted] = createSignal(true);
  const [retrying, setRetrying] = createSignal(false);
  // null = not checked yet, true = internet works, false = no internet
  const [hasInternet, setHasInternet] = createSignal<boolean | null>(null);

  // refs for exit SMIL animations so we can trigger them programmatically
  let exitOrangeCx: SVGAnimateElement | undefined;
  let exitOrangeOpacity: SVGAnimateElement | undefined;
  let exitBlackCx: SVGAnimateElement | undefined;
  let exitBlackOpacity: SVGAnimateElement | undefined;

  let animTimer: ReturnType<typeof setTimeout>;
  let exitTimer: ReturnType<typeof setTimeout>;
  let loopTimer: ReturnType<typeof setTimeout>;

  function clearTimers() {
    clearTimeout(animTimer);
    clearTimeout(exitTimer);
    clearTimeout(loopTimer);
  }

  function startCycle() {
    clearTimers();

    animTimer = setTimeout(() => setAnimationComplete(true), 3450);

    // if no connection after 5s, play exit and loop
    exitTimer = setTimeout(() => {
      if (props.relayConnected) return;

      setRetrying(true);

      // probe well-known hosts to determine if the issue is local or relay-side
      checkInternetConnectivity()
        .then((connected) => setHasInternet(connected))
        .catch(() => setHasInternet(false));

      // trigger reverse SMIL animations
      exitOrangeCx?.beginElement();
      exitOrangeOpacity?.beginElement();
      exitBlackCx?.beginElement();
      exitBlackOpacity?.beginElement();

      // after exit finishes, unmount svg briefly to reset all animations
      loopTimer = setTimeout(() => {
        setAnimationComplete(false);
        setSvgMounted(false);

        requestAnimationFrame(() => {
          setSvgMounted(true);
          startCycle();
        });
      }, 700);
    }, 5000);
  }

  onMount(() => startCycle());

  // handle successful relay connection
  createEffect(() => {
    if (animationComplete() && props.relayConnected && props.identity) {
      clearTimers();
      setRetrying(false);
      setShowWelcome(true);
      setTimeout(() => setFading(true), 1200);
      setTimeout(() => props.onComplete(), 1700);
    }
  });

  onCleanup(() => clearTimers());

  // derived status text to keep jsx clean
  const statusText = () => {
    if (showWelcome()) return null;
    if (retrying()) return "retrying connection...";
    if (animationComplete()) return "connecting...";
    return "loading dusk...";
  };

  // secondary diagnostic message shown when retrying
  const connectivityHint = () => {
    if (!retrying() || hasInternet() === null) return null;
    if (hasInternet()) {
      return "your connection is working, we can't reach the relay server right now";
    }
    return "your internet connection is down. please troubleshoot your connection";
  };

  return (
    <div
      class="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      classList={{ "splash-fadeout": fading() }}
    >
      <div class="flex flex-col items-center gap-8">
        <Show when={svgMounted()}>
          <svg
            width="160"
            height="160"
            viewBox="0 0 128 128"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* orange pops in at 2s (mostly visible on right), then slides left (80px travel) */}
            <circle
              cx="144"
              cy="64"
              r="40"
              fill="#FF4F00"
              class="splash-orange"
            >
              {/* entry: slide into crescent position */}
              <animate
                attributeName="cx"
                from="144"
                to="64"
                dur="300ms"
                begin="2.6s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.22, 1, 0.36, 1"
              />
              {/* exit: slide back off-screen right */}
              <animate
                ref={exitOrangeCx}
                attributeName="cx"
                from="64"
                to="200"
                dur="500ms"
                begin="indefinite"
                fill="freeze"
                calcMode="spline"
                keySplines="0.33, 0, 0.67, 1"
              />
              {/* exit: fade out */}
              <animate
                ref={exitOrangeOpacity}
                attributeName="opacity"
                from="1"
                to="0"
                dur="400ms"
                begin="indefinite"
                fill="freeze"
              />
            </circle>
            {/* black slides in from the left (80px travel) to carve the crescent */}
            <circle cx="-30" cy="52.3" r="33" fill="#000000" opacity="0">
              {/* entry: slide into mask position */}
              <animate
                attributeName="cx"
                from="-32"
                to="48"
                dur="300ms"
                begin="2.6s"
                fill="freeze"
                calcMode="paced"
                keySplines="0.22, 1, 0.36, 1"
              />
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="50ms"
                begin="2.6s"
                fill="freeze"
              />
              {/* exit: slide back off-screen left */}
              <animate
                ref={exitBlackCx}
                attributeName="cx"
                from="48"
                to="-60"
                dur="500ms"
                begin="indefinite"
                fill="freeze"
                calcMode="spline"
                keySplines="0.33, 0, 0.67, 1"
              />
              {/* exit: fade out */}
              <animate
                ref={exitBlackOpacity}
                attributeName="opacity"
                from="1"
                to="0"
                dur="400ms"
                begin="indefinite"
                fill="freeze"
              />
            </circle>
          </svg>
        </Show>
        <Show when={statusText()}>
          <p
            class="text-white/60 text-sm font-sans"
            classList={{ "animate-pulse": !showWelcome() }}
          >
            {statusText()}
          </p>
        </Show>
        <Show when={connectivityHint()}>
          <p class="text-white/40 text-xs font-sans max-w-xs text-center">
            {connectivityHint()}
          </p>
        </Show>
        <Show when={showWelcome() && props.identity}>
          <p class="text-white/60 text-sm font-sans">
            connected to dusk chat, welcome {props.identity?.display_name}!
          </p>
        </Show>
      </div>
    </div>
  );
};

export default SplashScreen;
