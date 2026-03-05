// canvas overlay for particle effect presets
// renders particles on a transparent canvas that sits above the avatar container

import type { Component } from "solid-js";
import { createEffect, onCleanup } from "solid-js";
import { ParticleSystem } from "../../lib/effects-particles";
import type { ParticlePresetName } from "../../lib/effects";

interface ParticleCanvasProps {
  preset: ParticlePresetName;
  duration: number;
  width: number;
  height: number;
  playing: boolean;
}

const ParticleCanvas: Component<ParticleCanvasProps> = (props) => {
  let canvasRef!: HTMLCanvasElement;
  let system: ParticleSystem | null = null;

  function teardown() {
    if (system) {
      system.stop();
      system = null;
    }
  }

  createEffect(() => {
    const shouldPlay = props.playing;
    const preset = props.preset;
    const duration = props.duration;

    if (!shouldPlay) {
      if (system) {
        system.finish();
      }
      return;
    }

    if (!canvasRef) return;

    // always clean up previous system before starting a new one
    teardown();

    // Use a larger physical canvas to allow particles to exist outside the bounds
    const OVERFLOW_FACTOR = 2.5;
    const physicalWidth = props.width * OVERFLOW_FACTOR;
    const physicalHeight = props.height * OVERFLOW_FACTOR;

    // We can also adapt to pixel ratio for high DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvasRef.width = physicalWidth * dpr;
    canvasRef.height = physicalHeight * dpr;

    // Scale context back so particle system math treats 100 units as props.width
    // This allows particle coordinates to scale automatically with avatar size
    const ctx = canvasRef.getContext("2d");
    if (ctx) {
      const scaleX = (props.width * dpr) / 100;
      const scaleY = (props.height * dpr) / 100;
      ctx.scale(scaleX, scaleY);

      // Shift context origin so (0,0) represents the top-left of the avatar.
      // Since the canvas is OVERFLOW_FACTOR times larger, we translate by the overflow margin.
      const logicalOffsetX = (100 * (OVERFLOW_FACTOR - 1)) / 2;
      const logicalOffsetY = (100 * (OVERFLOW_FACTOR - 1)) / 2;
      ctx.translate(logicalOffsetX, logicalOffsetY);
    }

    system = new ParticleSystem(
      canvasRef,
      preset,
      duration / 1000,
      () => {
        // natural completion, clear reference
        system = null;
      },
      100, // mapped logical width of avatar
      100, // mapped logical height of avatar
      100, // pass 100 for cssWidth so system uses offsetX=0 (handled by our ctx.translate)
      100, // pass 100 for cssHeight
    );
    system.start();
  });

  onCleanup(teardown);

  // keep in sync with OVERFLOW_FACTOR above
  const OVERFLOW_FACTOR = 2.5;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: `-${(OVERFLOW_FACTOR - 1) * 50}%`,
        left: `-${(OVERFLOW_FACTOR - 1) * 50}%`,
        width: `${props.width * OVERFLOW_FACTOR}px`,
        height: `${props.height * OVERFLOW_FACTOR}px`,
        "pointer-events": "none",
      }}
    />
  );
};

export default ParticleCanvas;
