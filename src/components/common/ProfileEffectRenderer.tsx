// runtime renderer that plays profile effects around an avatar
// wraps children in a container and creates overlay elements for each layer

import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, For, Show } from "solid-js";
import type {
  ProfileEffect,
  AnimationLayer,
  LayerElement,
} from "../../lib/effects";
import { layerToWebAnimationKeyframes, easingToCss } from "../../lib/effects";
import ShapeRenderer from "../../lib/effects-shapes";
import ParticleCanvas from "./ParticleCanvas";

interface ProfileEffectRendererProps {
  scope?: "avatar" | "card";
  effect: ProfileEffect | undefined;
  trigger: "click" | "hover" | "entrance";
  size: number;
  children: JSX.Element;
  playing?: boolean;
}

const ProfileEffectRenderer: Component<ProfileEffectRendererProps> = (
  props,
) => {
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [dimensions, setDimensions] = createSignal({
    w: props.size,
    h: props.size,
  });
  createEffect(() => {
    if (props.scope === "card" && containerRef) {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]) {
          setDimensions({
            w: entries[0].contentRect.width,
            h: entries[0].contentRect.height,
          });
        }
      });
      ro.observe(containerRef);
      onCleanup(() => ro.disconnect());
    } else {
      setDimensions({ w: props.size, h: props.size });
    }
  });

  const layersToRender = () => {
    if (!props.effect) return [];
    if (props.scope === "card") return props.effect.card_layers || [];
    return props.effect.layers || [];
  };
  let containerRef!: HTMLDivElement;
  let animations: Animation[] = [];
  let cancelTimeout: number | undefined;

  function cancelAnimations() {
    for (const anim of animations) {
      anim.cancel();
    }
    animations = [];
    if (cancelTimeout !== undefined) {
      window.clearTimeout(cancelTimeout);
      cancelTimeout = undefined;
    }
  }

  function playEffect() {
    const effect = props.effect;
    if (!effect || !containerRef) return;

    cancelAnimations();
    setIsPlaying(true);

    for (const layer of layersToRender()) {
      // particle layers are handled by ParticleCanvas, skip them here
      if (layer.element.type === "particle-preset") continue;

      const el = containerRef.querySelector<HTMLElement>(
        `[data-layer-id="${layer.id}"]`,
      );
      if (!el) continue;

      const keyframes = layerToWebAnimationKeyframes(layer);
      const anim = el.animate(keyframes, {
        duration: effect.duration,
        delay: layer.delay,
        easing: easingToCss(layer.easing),
        iterations: layer.repeat === -1 ? Infinity : layer.repeat + 1,
        fill: "both",
      });

      anim.onfinish = () => {
        // remove finished animation from tracking
        animations = animations.filter((a) => a !== anim);
        // when all non-particle animations finish, trigger natural stop
        if (animations.length === 0) {
          stopEffect();
        }
      };

      animations.push(anim);
    }

    // if there are no non-particle layers, use a timeout for particle duration
    const hasNonParticle = layersToRender().some(
      (l) => l.element.type !== "particle-preset",
    );
    if (!hasNonParticle) {
      setTimeout(() => stopEffect(), effect.duration);
    }
  }

  function stopEffect() {
    // don't try to stop if we already did
    if (!isPlaying()) return;

    setIsPlaying(false);

    if (cancelTimeout !== undefined) {
      window.clearTimeout(cancelTimeout);
    }

    // schedule visual cleanup after CSS fade completes (400ms)
    cancelTimeout = window.setTimeout(() => {
      cancelAnimations();
    }, 400);
  }

  // handle playing prop override for editor preview
  createEffect(() => {
    const externalPlaying = props.playing;
    if (externalPlaying === undefined) return;

    if (externalPlaying) {
      playEffect();
    } else {
      stopEffect();
    }
  });

  // handle entrance trigger
  createEffect(() => {
    if (
      props.trigger === "entrance" &&
      props.effect &&
      props.playing === undefined
    ) {
      const timer = setTimeout(() => {
        playEffect();
      }, 1000);
      onCleanup(() => clearTimeout(timer));
    }
  });

  function handleClick() {
    if (props.playing !== undefined) return;
    if (props.trigger !== "click") return;
    if (!props.effect) return;
    playEffect();
  }

  function handleMouseEnter() {
    if (props.playing !== undefined) return;
    if (props.trigger !== "hover") return;
    if (!props.effect) return;
    playEffect();
  }

  function handleMouseLeave() {
    if (props.playing !== undefined) return;
    if (props.trigger !== "hover") return;
    stopEffect();
  }

  onCleanup(() => {
    cancelAnimations();
  });

  // render the visual element for a given layer
  function renderLayerElement(element: LayerElement): JSX.Element {
    switch (element.type) {
      case "avatar":
        // avatar layers animate the children wrapper, no extra visual
        return undefined as unknown as JSX.Element;

      case "shape":
        return (
          <ShapeRenderer
            shape={element.shape}
            size={element.size}
            fill={element.fill}
            stroke={element.stroke}
          />
        );

      case "path":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            style={{
              width: "100%",
              height: "100%",
              overflow: "visible",
            }}
          >
            <path
              d={element.d}
              stroke={element.stroke}
              stroke-width={element.strokeWidth}
              fill={element.fill ?? "none"}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        );

      case "icon":
        // placeholder for icon rendering, displays icon name as text
        return (
          <span
            style={{
              color: element.color,
              "font-size": `${element.size}px`,
              "line-height": "1",
              "user-select": "none",
            }}
          >
            {element.icon}
          </span>
        );

      case "text":
        return (
          <span
            style={{
              color: element.color,
              "font-size": `${element.size}px`,
              "font-family":
                element.font === "sans" ? "var(--font-sans)" : element.font,
              "line-height": "1",
              "white-space": "nowrap",
              "user-select": "none",
            }}
          >
            {element.content}
          </span>
        );

      case "particle-preset":
        // handled separately via ParticleCanvas
        return undefined as unknown as JSX.Element;
    }
  }

  // check if a layer is the avatar type so we can use it to wrap children
  function isAvatarLayer(layer: AnimationLayer): boolean {
    return layer.element.type === "avatar";
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: props.scope === "card" ? "100%" : `${props.size}px`,
        height: props.scope === "card" ? "100%" : `${props.size}px`,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Show when={props.effect} fallback={props.children}>
        {(effect) => {
          // find the avatar layer if any, so we can wrap children with its data-layer-id
          const avatarLayer = () =>
            layersToRender().find((l) => isAvatarLayer(l));

          return (
            <>
              {/* avatar wrapper - gets animated if there's an avatar layer */}
              <div
                data-layer-id={avatarLayer()?.id ?? "avatar-wrapper"}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                }}
              >
                {props.children}
              </div>

              {/* non-avatar, non-particle overlay layers */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  "pointer-events": "none",
                  opacity: isPlaying() ? 1 : 0,
                  transition: isPlaying() ? "none" : "opacity 400ms ease-out",
                }}
              >
                <For
                  each={layersToRender().filter(
                    (l) =>
                      l.element.type !== "avatar" &&
                      l.element.type !== "particle-preset",
                  )}
                >
                  {(layer) => (
                    <div
                      data-layer-id={layer.id}
                      style={{
                        position: "absolute",
                        top: "0",
                        left: "0",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        "pointer-events": "none",
                      }}
                    >
                      {renderLayerElement(layer.element)}
                    </div>
                  )}
                </For>
              </div>

              {/* particle preset layers */}
              <For
                each={layersToRender().filter(
                  (l) => l.element.type === "particle-preset",
                )}
              >
                {(layer) => (
                  <Show when={layer.element.type === "particle-preset"}>
                    <ParticleCanvas
                      preset={
                        (
                          layer.element as Extract<
                            LayerElement,
                            { type: "particle-preset" }
                          >
                        ).preset
                      }
                      duration={effect().duration}
                      width={dimensions().w}
                      height={dimensions().h}
                      playing={isPlaying()}
                    />
                  </Show>
                )}
              </For>
            </>
          );
        }}
      </Show>
    </div>
  );
};

export default ProfileEffectRenderer;
