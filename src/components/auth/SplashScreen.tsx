import {
  Component,
  createSignal,
  createEffect,
  onMount,
  Show,
  onCleanup,
  For,
} from "solid-js";
import type { PublicIdentity } from "../../lib/types";
import { checkInternetConnectivity, setRelayAddress } from "../../lib/tauri";
import Button from "../common/Button";

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
  const [showRelayPicker, setShowRelayPicker] = createSignal(false);
  const [customRelay, setCustomRelay] = createSignal("");

  // alternative public relays (would be populated from a discovery service in production)
  const alternativeRelays = [
    {
      name: "primary relay (default)",
      addr: "/dns4/relay.duskchat.app/tcp/4001/p2p/12D3KooWGQkCkACcibJPKzus7Q6U1aYngfTuS4gwYwmJkJJtrSaw",
    },
    {
      name: "us-west relay",
      addr: "/dns4/relay-us-west.duskchat.app/tcp/4001/p2p/12D3KooWExample1",
    },
    {
      name: "eu-central relay",
      addr: "/dns4/relay-eu.duskchat.app/tcp/4001/p2p/12D3KooWExample2",
    },
  ];

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

    // if no connection after 5s, play exit and loop (only for returning users)
    exitTimer = setTimeout(() => {
      if (props.relayConnected || !props.identity) return;

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

  // handle successful relay connection for returning users
  createEffect(() => {
    if (animationComplete() && props.relayConnected && props.identity) {
      clearTimers();
      setRetrying(false);
      setShowWelcome(true);
      setTimeout(() => setFading(true), 1200);
      setTimeout(() => props.onComplete(), 1700);
    }
  });

  // fresh install - no identity on disk, play the animation then hand off to signup
  createEffect(() => {
    if (animationComplete() && !props.identity) {
      clearTimers();
      setFading(true);
      setTimeout(() => props.onComplete(), 500);
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

        {/* show relay picker button if relay is unreachable but internet works */}
        <Show when={retrying() && hasInternet()}>
          <div class="flex flex-col items-center gap-3 mt-4">
            <p class="text-white/50 text-xs font-sans">
              the default relay may be at capacity or offline
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowRelayPicker(true)}
            >
              choose a different relay
            </Button>
          </div>
        </Show>

        {/* relay picker modal */}
        <Show when={showRelayPicker()}>
          <div class="fixed inset-0 z-10000 bg-black/90 flex items-center justify-center">
            <div class="bg-gray-900 border-2 border-white/20 p-6 max-w-md w-full mx-4">
              <h2 class="text-white text-lg font-sans mb-4">select a relay</h2>
              <p class="text-white/60 text-sm font-sans mb-6">
                choose an alternative relay server or enter a custom address
              </p>

              <div class="space-y-2 mb-6">
                <For each={alternativeRelays}>
                  {(relay) => (
                    <button
                      class="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-white/10 hover:border-accent transition-colors"
                      onClick={async () => {
                        try {
                          await setRelayAddress(relay.addr);
                          setShowRelayPicker(false);
                          // restart the connection cycle
                          setRetrying(false);
                          setHasInternet(null);
                          startCycle();
                        } catch (e) {
                          console.error("failed to switch relay:", e);
                        }
                      }}
                    >
                      <div class="text-white text-sm font-sans">{relay.name}</div>
                      <div class="text-white/40 text-xs font-mono mt-1 truncate">
                        {relay.addr}
                      </div>
                    </button>
                  )}
                </For>
              </div>

              <div class="mb-4">
                <label class="text-white/60 text-xs font-sans mb-2 block">
                  or enter custom relay address
                </label>
                <input
                  type="text"
                  class="w-full bg-gray-800 border border-white/10 px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-accent"
                  placeholder="/dns4/relay.example.com/tcp/4001/p2p/12D3..."
                  value={customRelay()}
                  onInput={(e) => setCustomRelay(e.currentTarget.value)}
                />
              </div>

              <div class="flex gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowRelayPicker(false)}
                  class="flex-1"
                >
                  cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!customRelay().trim()}
                  onClick={async () => {
                    try {
                      await setRelayAddress(customRelay());
                      setShowRelayPicker(false);
                      setCustomRelay("");
                      // restart the connection cycle
                      setRetrying(false);
                      setHasInternet(null);
                      startCycle();
                    } catch (e) {
                      console.error("failed to switch to custom relay:", e);
                      alert(`Invalid relay address: ${e}`);
                    }
                  }}
                  class="flex-1"
                >
                  connect
                </Button>
              </div>
            </div>
          </div>
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
