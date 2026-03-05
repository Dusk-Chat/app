// default animation presets organized by category
// crafted with love, precision, and cinematic timing for maximum emotional impact

import type { ProfileEffect } from "./effects";

export interface PresetCategory {
  id: string;
  name: string;
  presets: ProfileEffect[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ETHEREAL & TRANSCENDENT
// effects that feel otherworldly, magical, and delicately beautiful
// ═══════════════════════════════════════════════════════════════════════════════

const etherealAwakening: ProfileEffect = {
  id: "preset-ethereal-awakening",
  name: "Ethereal Awakening",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 4000,
  layers: [
    // outermost aurora ribbon
    {
      id: "awakening-aurora",
      element: { type: "particle-preset", preset: "aurora" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 0.8 } },
        { offset: 0.85, properties: { opacity: 0.8 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    // rotating cosmic ring - counter-clockwise
    {
      id: "awakening-ring-outer",
      element: {
        type: "shape",
        shape: "ring",
        fill: "rgba(0, 240, 255, 0.15)",
        stroke: "#00f0ff",
        size: 110,
      },
      keyframes: [
        {
          offset: 0,
          properties: {
            scale: 0.6,
            opacity: 0,
            rotation: 45,
            glowColor: "#00f0ff",
            glowSize: 5,
          },
        },
        {
          offset: 0.2,
          properties: {
            scale: 1.15,
            opacity: 0.6,
            rotation: -15,
            glowColor: "#00f0ff",
            glowSize: 25,
          },
        },
        {
          offset: 0.5,
          properties: {
            scale: 1.05,
            opacity: 0.4,
            rotation: -90,
            glowColor: "#44ffff",
            glowSize: 35,
          },
        },
        {
          offset: 0.8,
          properties: {
            scale: 1.2,
            opacity: 0.5,
            rotation: -180,
            glowColor: "#00f0ff",
            glowSize: 25,
          },
        },
        {
          offset: 1,
          properties: {
            scale: 0.7,
            opacity: 0,
            rotation: -270,
            glowColor: "#00f0ff",
            glowSize: 5,
          },
        },
      ],
      easing: { cubic: [0.34, 1.56, 0.64, 1] },
      delay: 0,
      repeat: 0,
    },
    // inner ring - clockwise
    {
      id: "awakening-ring-inner",
      element: {
        type: "shape",
        shape: "ring",
        fill: "rgba(170, 0, 255, 0.1)",
        stroke: "#aa00ff",
        size: 85,
      },
      keyframes: [
        { offset: 0, properties: { scale: 1.3, opacity: 0, rotation: -30 } },
        {
          offset: 0.25,
          properties: {
            scale: 0.9,
            opacity: 0.5,
            rotation: 60,
            glowColor: "#aa00ff",
            glowSize: 20,
          },
        },
        {
          offset: 0.5,
          properties: {
            scale: 1.0,
            opacity: 0.35,
            rotation: 180,
            glowColor: "#cc44ff",
            glowSize: 30,
          },
        },
        {
          offset: 0.75,
          properties: { scale: 0.85, opacity: 0.45, rotation: 300 },
        },
        { offset: 1, properties: { scale: 1.2, opacity: 0, rotation: 390 } },
      ],
      easing: "ease-in-out",
      delay: 100,
      repeat: 0,
    },
    // stardust backdrop
    {
      id: "awakening-stars",
      element: { type: "particle-preset", preset: "stardust" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.1, properties: { opacity: 1 } },
        { offset: 0.9, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 200,
      repeat: 0,
    },
    // avatar with gentle levitation and divine glow
    {
      id: "awakening-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { y: 0, scale: 1, glowColor: "#ffffff", glowSize: 0 },
        },
        {
          offset: 0.15,
          properties: {
            y: -3,
            scale: 1.02,
            glowColor: "#00f0ff",
            glowSize: 10,
          },
        },
        {
          offset: 0.35,
          properties: {
            y: -10,
            scale: 1.06,
            glowColor: "#88ffff",
            glowSize: 30,
          },
        },
        {
          offset: 0.5,
          properties: {
            y: -12,
            scale: 1.08,
            glowColor: "#ffffff",
            glowSize: 40,
          },
        },
        {
          offset: 0.65,
          properties: {
            y: -10,
            scale: 1.06,
            glowColor: "#aa88ff",
            glowSize: 30,
          },
        },
        {
          offset: 0.85,
          properties: {
            y: -3,
            scale: 1.02,
            glowColor: "#aa00ff",
            glowSize: 10,
          },
        },
        {
          offset: 1,
          properties: { y: 0, scale: 1, glowColor: "#ffffff", glowSize: 0 },
        },
      ],
      easing: { cubic: [0.45, 0, 0.55, 1] },
      delay: 0,
      repeat: 0,
    },
  ],
};

const cosmicDreamer: ProfileEffect = {
  id: "preset-cosmic-dreamer",
  name: "Cosmic Dreamer",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 5000,
  layers: [
    {
      id: "dreamer-cosmos",
      element: { type: "particle-preset", preset: "cosmos" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.1, properties: { opacity: 1 } },
        { offset: 0.9, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "dreamer-nebula-1",
      element: { type: "shape", shape: "circle", fill: "#6622cc", size: 150 },
      keyframes: [
        {
          offset: 0,
          properties: { x: -30, y: -20, scale: 0.5, opacity: 0, blur: 30 },
        },
        {
          offset: 0.3,
          properties: { x: -15, y: 10, scale: 1.2, opacity: 0.25, blur: 50 },
        },
        {
          offset: 0.7,
          properties: { x: 20, y: -10, scale: 0.8, opacity: 0.3, blur: 40 },
        },
        {
          offset: 1,
          properties: { x: 30, y: 20, scale: 0.4, opacity: 0, blur: 30 },
        },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "dreamer-nebula-2",
      element: { type: "shape", shape: "circle", fill: "#ff44aa", size: 120 },
      keyframes: [
        {
          offset: 0,
          properties: { x: 30, y: 15, scale: 0.4, opacity: 0, blur: 25 },
        },
        {
          offset: 0.4,
          properties: { x: 10, y: -15, scale: 1.0, opacity: 0.2, blur: 45 },
        },
        {
          offset: 0.8,
          properties: { x: -20, y: 5, scale: 0.7, opacity: 0.25, blur: 35 },
        },
        {
          offset: 1,
          properties: { x: -30, y: -20, scale: 0.3, opacity: 0, blur: 25 },
        },
      ],
      easing: "ease-in-out",
      delay: 200,
      repeat: 0,
    },
    {
      id: "dreamer-orbit-star",
      element: { type: "shape", shape: "star", fill: "#ffffff", size: 12 },
      keyframes: [
        {
          offset: 0,
          properties: {
            x: 50,
            y: 0,
            scale: 0.8,
            opacity: 0,
            glowColor: "#ffffff",
            glowSize: 10,
          },
        },
        {
          offset: 0.125,
          properties: {
            x: 35,
            y: 35,
            scale: 1.2,
            opacity: 0.9,
            glowColor: "#ffffaa",
            glowSize: 15,
          },
        },
        { offset: 0.25, properties: { x: 0, y: 50, scale: 0.6, opacity: 0.7 } },
        {
          offset: 0.375,
          properties: { x: -35, y: 35, scale: 1.0, opacity: 0.8 },
        },
        {
          offset: 0.5,
          properties: { x: -50, y: 0, scale: 1.3, opacity: 1, glowSize: 20 },
        },
        {
          offset: 0.625,
          properties: { x: -35, y: -35, scale: 0.9, opacity: 0.8 },
        },
        {
          offset: 0.75,
          properties: { x: 0, y: -50, scale: 0.5, opacity: 0.6 },
        },
        {
          offset: 0.875,
          properties: { x: 35, y: -35, scale: 1.1, opacity: 0.85 },
        },
        { offset: 1, properties: { x: 50, y: 0, scale: 0.8, opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "dreamer-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1, y: 0 } },
        {
          offset: 0.25,
          properties: {
            scale: 0.97,
            y: -6,
            glowColor: "#6622cc",
            glowSize: 15,
          },
        },
        {
          offset: 0.5,
          properties: {
            scale: 1.03,
            y: -8,
            glowColor: "#ff44aa",
            glowSize: 20,
          },
        },
        {
          offset: 0.75,
          properties: {
            scale: 0.98,
            y: -5,
            glowColor: "#aa44ff",
            glowSize: 15,
          },
        },
        {
          offset: 1,
          properties: { scale: 1, y: 0, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

const divineRadiance: ProfileEffect = {
  id: "preset-divine-radiance",
  name: "Divine Radiance",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 3500,
  layers: [
    {
      id: "radiance-burst",
      element: { type: "shape", shape: "burst", fill: "#ffd700", size: 180 },
      keyframes: [
        {
          offset: 0,
          properties: { scale: 0.3, opacity: 0, rotation: 0, blur: 10 },
        },
        {
          offset: 0.3,
          properties: {
            scale: 0.8,
            opacity: 0.4,
            rotation: 15,
            blur: 20,
            glowColor: "#ffd700",
            glowSize: 30,
          },
        },
        {
          offset: 0.6,
          properties: { scale: 1.2, opacity: 0.25, rotation: 30, blur: 30 },
        },
        {
          offset: 1,
          properties: { scale: 1.8, opacity: 0, rotation: 45, blur: 40 },
        },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "radiance-glitter",
      element: { type: "particle-preset", preset: "glitter" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 1 } },
        { offset: 0.85, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 150,
      repeat: 0,
    },
    {
      id: "radiance-halo",
      element: {
        type: "shape",
        shape: "ring",
        fill: "none",
        stroke: "#ffd700",
        size: 80,
      },
      keyframes: [
        { offset: 0, properties: { y: 20, scale: 0.7, opacity: 0 } },
        {
          offset: 0.25,
          properties: {
            y: -45,
            scale: 1.0,
            opacity: 0.9,
            glowColor: "#fff000",
            glowSize: 15,
          },
        },
        {
          offset: 0.5,
          properties: { y: -50, scale: 1.1, opacity: 0.8, glowSize: 20 },
        },
        { offset: 0.75, properties: { y: -45, scale: 1.0, opacity: 0.6 } },
        { offset: 1, properties: { y: -30, scale: 0.85, opacity: 0 } },
      ],
      easing: { cubic: [0.25, 1, 0.5, 1] },
      delay: 100,
      repeat: 0,
    },
    {
      id: "radiance-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { y: 0, scale: 1, glowColor: "#ffffff", glowSize: 0 },
        },
        {
          offset: 0.2,
          properties: {
            y: -5,
            scale: 1.02,
            glowColor: "#ffd700",
            glowSize: 15,
          },
        },
        {
          offset: 0.5,
          properties: {
            y: -10,
            scale: 1.06,
            glowColor: "#ffffff",
            glowSize: 35,
          },
        },
        {
          offset: 0.8,
          properties: {
            y: -5,
            scale: 1.03,
            glowColor: "#ffd700",
            glowSize: 20,
          },
        },
        {
          offset: 1,
          properties: { y: 0, scale: 1, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPLOSIVE & POWERFUL
// ═══════════════════════════════════════════════════════════════════════════════

const superNova: ProfileEffect = {
  id: "preset-supernova",
  name: "Supernova Core",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 2200,
  layers: [
    {
      id: "nova-avatar-compress",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1, x: 0, y: 0 } },
        { offset: 0.05, properties: { scale: 0.7, x: -3, y: 2 } },
        { offset: 0.08, properties: { scale: 0.65, x: 3, y: -2 } },
        { offset: 0.1, properties: { scale: 0.6, x: -2, y: -1 } },
        {
          offset: 0.12,
          properties: { scale: 0.55, glowColor: "#ffffff", glowSize: 50 },
        },
        {
          offset: 0.15,
          properties: {
            scale: 1.5,
            x: 0,
            y: 0,
            glowColor: "#ffea00",
            glowSize: 80,
          },
        },
        {
          offset: 0.25,
          properties: { scale: 1.2, glowColor: "#ff8800", glowSize: 50 },
        },
        {
          offset: 0.4,
          properties: { scale: 1.05, glowColor: "#ff4400", glowSize: 25 },
        },
        { offset: 0.6, properties: { scale: 0.98 } },
        { offset: 0.8, properties: { scale: 1.02 } },
        {
          offset: 1,
          properties: { scale: 1, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "nova-flash",
      element: { type: "shape", shape: "circle", fill: "#ffffff", size: 200 },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0 } },
        { offset: 0.12, properties: { scale: 0.1, opacity: 0 } },
        { offset: 0.15, properties: { scale: 2, opacity: 1, blur: 20 } },
        { offset: 0.25, properties: { scale: 3.5, opacity: 0, blur: 50 } },
        { offset: 1, properties: { scale: 4, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "nova-burst-main",
      element: { type: "shape", shape: "burst", fill: "#ffea00", size: 160 },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, rotation: 0 } },
        { offset: 0.12, properties: { scale: 0, opacity: 0, rotation: 0 } },
        {
          offset: 0.18,
          properties: {
            scale: 1.5,
            opacity: 1,
            rotation: 30,
            glowColor: "#ff8800",
            glowSize: 50,
          },
        },
        {
          offset: 0.35,
          properties: {
            scale: 2.5,
            opacity: 0.5,
            rotation: 60,
            glowColor: "#ff4400",
            glowSize: 30,
          },
        },
        { offset: 0.6, properties: { scale: 3.5, opacity: 0, rotation: 90 } },
        { offset: 1, properties: { scale: 4, opacity: 0, rotation: 120 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "nova-shockwave",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#ffffff",
        stroke: "#ffcc00",
        size: 100,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0.3, opacity: 0 } },
        { offset: 0.15, properties: { scale: 0.5, opacity: 0 } },
        { offset: 0.2, properties: { scale: 1.5, opacity: 1 } },
        { offset: 0.5, properties: { scale: 4, opacity: 0.2, blur: 5 } },
        { offset: 0.8, properties: { scale: 6, opacity: 0, blur: 10 } },
        { offset: 1, properties: { scale: 6, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "nova-embers",
      element: { type: "particle-preset", preset: "embers" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 0 } },
        { offset: 0.2, properties: { opacity: 1 } },
        { offset: 0.8, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

const thunderGod: ProfileEffect = {
  id: "preset-thunder-god",
  name: "Thunder God",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 1800,
  layers: [
    {
      id: "thunder-electric",
      element: { type: "particle-preset", preset: "electric" },
      keyframes: [
        { offset: 0, properties: { opacity: 1 } },
        { offset: 0.8, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "thunder-flash-1",
      element: { type: "shape", shape: "circle", fill: "#ffffff", size: 180 },
      keyframes: [
        { offset: 0, properties: { opacity: 0, blur: 30 } },
        { offset: 0.02, properties: { opacity: 1, blur: 50 } },
        { offset: 0.06, properties: { opacity: 0, blur: 30 } },
        { offset: 0.25, properties: { opacity: 0 } },
        { offset: 0.27, properties: { opacity: 0.9, blur: 40 } },
        { offset: 0.32, properties: { opacity: 0 } },
        { offset: 0.5, properties: { opacity: 0 } },
        { offset: 0.52, properties: { opacity: 0.6, blur: 35 } },
        { offset: 0.58, properties: { opacity: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "thunder-bolt-1",
      element: { type: "shape", shape: "lightning", fill: "#00e5ff", size: 80 },
      keyframes: [
        {
          offset: 0,
          properties: { x: 0, y: -100, opacity: 0, scale: 1, rotation: 0 },
        },
        {
          offset: 0.02,
          properties: {
            x: -5,
            y: 0,
            opacity: 1,
            scale: 1.3,
            glowColor: "#00e5ff",
            glowSize: 30,
          },
        },
        { offset: 0.12, properties: { x: 0, y: 20, opacity: 0, scale: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-in",
      delay: 0,
      repeat: 0,
    },
    {
      id: "thunder-bolt-2",
      element: { type: "shape", shape: "lightning", fill: "#ffffff", size: 60 },
      keyframes: [
        { offset: 0, properties: { x: 30, y: -90, opacity: 0, rotation: 15 } },
        { offset: 0.25, properties: { x: 30, y: -90, opacity: 0 } },
        {
          offset: 0.27,
          properties: {
            x: 20,
            y: -10,
            opacity: 1,
            scale: 1.2,
            rotation: 10,
            glowColor: "#ffffff",
            glowSize: 25,
          },
        },
        { offset: 0.38, properties: { x: 15, y: 30, opacity: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-in",
      delay: 0,
      repeat: 0,
    },
    {
      id: "thunder-bolt-3",
      element: { type: "shape", shape: "lightning", fill: "#88ffff", size: 50 },
      keyframes: [
        {
          offset: 0,
          properties: { x: -25, y: -85, opacity: 0, rotation: -10 },
        },
        { offset: 0.5, properties: { x: -25, y: -85, opacity: 0 } },
        {
          offset: 0.52,
          properties: {
            x: -15,
            y: -5,
            opacity: 1,
            scale: 1.1,
            rotation: -5,
            glowColor: "#88ffff",
            glowSize: 20,
          },
        },
        { offset: 0.65, properties: { x: -10, y: 25, opacity: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-in",
      delay: 0,
      repeat: 0,
    },
    {
      id: "thunder-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { x: 0, y: 0, scale: 1 } },
        {
          offset: 0.02,
          properties: {
            x: -10,
            y: -5,
            scale: 1.1,
            glowColor: "#00e5ff",
            glowSize: 40,
          },
        },
        {
          offset: 0.06,
          properties: {
            x: 8,
            y: 3,
            scale: 1.05,
            glowColor: "#ffffff",
            glowSize: 30,
          },
        },
        { offset: 0.1, properties: { x: -6, y: -2, scale: 1.08 } },
        { offset: 0.15, properties: { x: 4, y: 4, scale: 1 } },
        {
          offset: 0.27,
          properties: {
            x: 10,
            y: -6,
            scale: 1.12,
            glowColor: "#00e5ff",
            glowSize: 35,
          },
        },
        { offset: 0.32, properties: { x: -7, y: 5, scale: 1.05 } },
        { offset: 0.4, properties: { x: 0, y: 0, scale: 1 } },
        {
          offset: 0.52,
          properties: {
            x: -8,
            y: 4,
            scale: 1.08,
            glowColor: "#88ffff",
            glowSize: 25,
          },
        },
        { offset: 0.6, properties: { x: 5, y: -3, scale: 1.02 } },
        {
          offset: 0.7,
          properties: {
            x: 0,
            y: 0,
            scale: 1,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
        { offset: 1, properties: { x: 0, y: 0, scale: 1 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
  ],
};

const plasmaVortex: ProfileEffect = {
  id: "preset-plasma-vortex",
  name: "Plasma Vortex",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 2500,
  layers: [
    {
      id: "vortex-particles",
      element: { type: "particle-preset", preset: "vortex" },
      keyframes: [
        { offset: 0, properties: { opacity: 1 } },
        { offset: 0.85, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "vortex-plasma",
      element: { type: "particle-preset", preset: "plasma" },
      keyframes: [
        { offset: 0, properties: { opacity: 0.7 } },
        { offset: 0.5, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-in-out",
      delay: 200,
      repeat: 0,
    },
    {
      id: "vortex-spiral",
      element: {
        type: "shape",
        shape: "spiral",
        fill: "#ff00ff",
        stroke: "#ff44ff",
        size: 120,
      },
      keyframes: [
        {
          offset: 0,
          properties: {
            rotation: 0,
            scale: 2,
            opacity: 0,
            glowColor: "#ff00ff",
            glowSize: 10,
          },
        },
        {
          offset: 0.3,
          properties: {
            rotation: 360,
            scale: 1,
            opacity: 0.7,
            glowColor: "#ff44ff",
            glowSize: 25,
          },
        },
        {
          offset: 0.7,
          properties: {
            rotation: 900,
            scale: 0.3,
            opacity: 0.9,
            glowColor: "#ffffff",
            glowSize: 40,
          },
        },
        { offset: 1, properties: { rotation: 1440, scale: 0, opacity: 0 } },
      ],
      easing: { cubic: [0.5, 0, 0.75, 0] },
      delay: 0,
      repeat: 0,
    },
    {
      id: "vortex-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1, rotation: 0 } },
        {
          offset: 0.3,
          properties: {
            scale: 0.85,
            rotation: 45,
            glowColor: "#ff00ff",
            glowSize: 20,
          },
        },
        {
          offset: 0.6,
          properties: {
            scale: 0.65,
            rotation: 180,
            glowColor: "#ffffff",
            glowSize: 40,
            blur: 3,
          },
        },
        {
          offset: 0.7,
          properties: {
            scale: 0.6,
            rotation: 270,
            glowColor: "#ff44ff",
            glowSize: 50,
            blur: 5,
          },
        },
        {
          offset: 0.75,
          properties: {
            scale: 1.3,
            rotation: 360,
            glowColor: "#ffffff",
            glowSize: 30,
            blur: 0,
          },
        },
        { offset: 0.85, properties: { scale: 1.1, rotation: 365 } },
        {
          offset: 1,
          properties: {
            scale: 1,
            rotation: 360,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
      ],
      easing: { cubic: [0.4, 0, 0.2, 1] },
      delay: 0,
      repeat: 0,
    },
  ],
};

const infernalStrike: ProfileEffect = {
  id: "preset-infernal-strike",
  name: "Infernal Strike",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 1800,
  layers: [
    {
      id: "infernal-impact",
      element: { type: "shape", shape: "burst", fill: "#ff1100", size: 150 },
      keyframes: [
        { offset: 0, properties: { y: 20, scale: 0.1, opacity: 0 } },
        { offset: 0.1, properties: { y: 15, scale: 0.3, opacity: 0 } },
        {
          offset: 0.15,
          properties: {
            y: 10,
            scale: 2,
            opacity: 1,
            glowColor: "#ff4400",
            glowSize: 50,
          },
        },
        {
          offset: 0.3,
          properties: {
            y: 10,
            scale: 2.5,
            opacity: 0.6,
            glowColor: "#ff1100",
            glowSize: 30,
          },
        },
        { offset: 0.6, properties: { y: 10, scale: 3, opacity: 0, blur: 5 } },
        { offset: 1, properties: { y: 10, scale: 3, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "infernal-cross",
      element: {
        type: "shape",
        shape: "cross",
        fill: "#ffa600",
        stroke: "#ff0000",
        size: 100,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0.3, rotation: 0, opacity: 0 } },
        { offset: 0.1, properties: { scale: 0.3, opacity: 0 } },
        {
          offset: 0.15,
          properties: {
            scale: 2,
            rotation: 22.5,
            opacity: 1,
            glowColor: "#ffa600",
            glowSize: 30,
          },
        },
        { offset: 0.3, properties: { scale: 2.8, rotation: 45, opacity: 0.5 } },
        {
          offset: 0.5,
          properties: { scale: 3.5, rotation: 67.5, opacity: 0, blur: 5 },
        },
        { offset: 1, properties: { scale: 4, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 50,
      repeat: 0,
    },
    {
      id: "infernal-embers",
      element: { type: "particle-preset", preset: "embers" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 1 } },
        { offset: 0.9, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 100,
      repeat: 0,
    },
    {
      id: "infernal-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { y: -60, scale: 0.8, opacity: 0 } },
        { offset: 0.05, properties: { y: -50, scale: 0.85, opacity: 0.5 } },
        { offset: 0.1, properties: { y: -20, scale: 0.95, opacity: 0.9 } },
        {
          offset: 0.15,
          properties: {
            y: 8,
            scale: 1.3,
            opacity: 1,
            glowColor: "#ff4400",
            glowSize: 50,
          },
        },
        {
          offset: 0.2,
          properties: { y: 5, scale: 1.15, glowColor: "#ff1100", glowSize: 35 },
        },
        {
          offset: 0.3,
          properties: { y: 0, scale: 1.05, glowColor: "#ff6600", glowSize: 20 },
        },
        { offset: 0.5, properties: { y: -3, scale: 1.02 } },
        {
          offset: 0.7,
          properties: { y: 0, scale: 1, glowColor: "#000000", glowSize: 0 },
        },
        { offset: 1, properties: { y: 0, scale: 1 } },
      ],
      easing: { cubic: [0.22, 1, 0.36, 1] },
      delay: 0,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELICATE & ROMANTIC
// ═══════════════════════════════════════════════════════════════════════════════

const sakuraBloom: ProfileEffect = {
  id: "preset-sakura-bloom",
  name: "Sakura Bloom",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 3000,
  layers: [
    {
      id: "sakura-bloom-bg",
      element: { type: "shape", shape: "circle", fill: "#ffb7c5", size: 120 },
      keyframes: [
        { offset: 0, properties: { scale: 0.3, opacity: 0, blur: 10 } },
        { offset: 0.15, properties: { scale: 0.8, opacity: 0.5, blur: 25 } },
        { offset: 0.4, properties: { scale: 1.3, opacity: 0.35, blur: 40 } },
        { offset: 0.7, properties: { scale: 1.6, opacity: 0.15, blur: 50 } },
        { offset: 1, properties: { scale: 2, opacity: 0, blur: 60 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "sakura-petals",
      element: { type: "particle-preset", preset: "petals" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.08, properties: { opacity: 1 } },
        { offset: 0.85, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-in",
      delay: 100,
      repeat: 0,
    },
    {
      id: "sakura-breeze",
      element: {
        type: "shape",
        shape: "spiral",
        fill: "#ffa3b5",
        stroke: "#ffccd5",
        size: 100,
      },
      keyframes: [
        { offset: 0, properties: { rotation: -90, scale: 0.3, opacity: 0 } },
        { offset: 0.2, properties: { rotation: 0, scale: 0.9, opacity: 0.5 } },
        {
          offset: 0.5,
          properties: { rotation: 180, scale: 1.2, opacity: 0.4 },
        },
        {
          offset: 0.8,
          properties: { rotation: 360, scale: 1.5, opacity: 0.2 },
        },
        { offset: 1, properties: { rotation: 450, scale: 1.8, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "sakura-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1, y: 0 } },
        {
          offset: 0.15,
          properties: {
            scale: 1.08,
            y: -6,
            glowColor: "#ffb7c5",
            glowSize: 15,
          },
        },
        {
          offset: 0.35,
          properties: {
            scale: 1.05,
            y: -4,
            glowColor: "#ffd4dc",
            glowSize: 20,
          },
        },
        { offset: 0.6, properties: { scale: 1.02, y: -2 } },
        {
          offset: 1,
          properties: { scale: 1, y: 0, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: { cubic: [0.25, 1, 0.5, 1] },
      delay: 0,
      repeat: 0,
    },
  ],
};

const loveSpell: ProfileEffect = {
  id: "preset-love-spell",
  name: "Love Spell",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 2800,
  layers: [
    {
      id: "love-hearts",
      element: { type: "particle-preset", preset: "hearts" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.1, properties: { opacity: 1 } },
        { offset: 0.85, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "love-heart-center",
      element: { type: "shape", shape: "heart", fill: "#ff3366", size: 60 },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, y: 0 } },
        { offset: 0.05, properties: { scale: 0.4, opacity: 0.3 } },
        {
          offset: 0.1,
          properties: {
            scale: 1.8,
            opacity: 1,
            glowColor: "#ff3366",
            glowSize: 30,
          },
        },
        { offset: 0.2, properties: { scale: 1.4, opacity: 0.8, glowSize: 20 } },
        { offset: 0.35, properties: { scale: 2.2, opacity: 0.5, y: -10 } },
        { offset: 0.6, properties: { scale: 2.8, opacity: 0, y: -20 } },
        { offset: 1, properties: { scale: 3, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "love-glitter",
      element: { type: "particle-preset", preset: "glitter" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 0.8 } },
        { offset: 0.7, properties: { opacity: 0.8 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 100,
      repeat: 0,
    },
    {
      id: "love-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1 } },
        {
          offset: 0.08,
          properties: { scale: 1.15, glowColor: "#ff3366", glowSize: 25 },
        },
        { offset: 0.15, properties: { scale: 1.05 } },
        {
          offset: 0.22,
          properties: { scale: 1.12, glowColor: "#ff6699", glowSize: 20 },
        },
        { offset: 0.3, properties: { scale: 1, glowSize: 10 } },
        { offset: 0.45, properties: { scale: 1.08, glowSize: 15 } },
        { offset: 0.55, properties: { scale: 1.02 } },
        { offset: 0.7, properties: { scale: 1.05 } },
        { offset: 0.85, properties: { scale: 1.01 } },
        {
          offset: 1,
          properties: { scale: 1, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

const frostNova: ProfileEffect = {
  id: "preset-frost-nova",
  name: "Frost Nova",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 2200,
  layers: [
    {
      id: "frost-crystal-ring",
      element: {
        type: "shape",
        shape: "diamond",
        fill: "rgba(200, 240, 255, 0.3)",
        stroke: "#88ccff",
        size: 100,
      },
      keyframes: [
        {
          offset: 0,
          properties: {
            scale: 0,
            opacity: 1,
            rotation: 0,
            glowColor: "#ffffff",
            glowSize: 30,
          },
        },
        {
          offset: 0.2,
          properties: {
            scale: 1.5,
            opacity: 0.8,
            rotation: 45,
            glowColor: "#88ccff",
            glowSize: 40,
          },
        },
        {
          offset: 0.5,
          properties: {
            scale: 2.5,
            opacity: 0.4,
            rotation: 90,
            glowColor: "#aaddff",
            glowSize: 30,
          },
        },
        {
          offset: 0.8,
          properties: { scale: 3.5, opacity: 0.1, rotation: 135 },
        },
        { offset: 1, properties: { scale: 4, opacity: 0, rotation: 180 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "frost-crystal-2",
      element: {
        type: "shape",
        shape: "diamond",
        fill: "rgba(136, 204, 255, 0.2)",
        stroke: "#ccffff",
        size: 80,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, rotation: 22.5 } },
        { offset: 0.1, properties: { scale: 0.3, opacity: 0 } },
        {
          offset: 0.25,
          properties: { scale: 1.8, opacity: 0.6, rotation: 67.5 },
        },
        {
          offset: 0.6,
          properties: { scale: 3, opacity: 0.2, rotation: 112.5 },
        },
        { offset: 1, properties: { scale: 4.5, opacity: 0, rotation: 157.5 } },
      ],
      easing: "ease-out",
      delay: 80,
      repeat: 0,
    },
    {
      id: "frost-snow",
      element: { type: "particle-preset", preset: "snow" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.1, properties: { opacity: 1 } },
        { offset: 0.85, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 150,
      repeat: 0,
    },
    {
      id: "frost-mist",
      element: { type: "shape", shape: "circle", fill: "#ccffff", size: 150 },
      keyframes: [
        { offset: 0, properties: { scale: 0.5, opacity: 0, blur: 20, y: 20 } },
        {
          offset: 0.15,
          properties: { scale: 1, opacity: 0.4, blur: 30, y: 10 },
        },
        {
          offset: 0.4,
          properties: { scale: 1.5, opacity: 0.25, blur: 50, y: 0 },
        },
        {
          offset: 0.7,
          properties: { scale: 2, opacity: 0.1, blur: 60, y: -10 },
        },
        { offset: 1, properties: { scale: 2.5, opacity: 0, blur: 70 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "frost-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { scale: 1, glowColor: "#ffffff", glowSize: 0 },
        },
        {
          offset: 0.08,
          properties: { scale: 0.92, glowColor: "#ffffff", glowSize: 40 },
        },
        {
          offset: 0.15,
          properties: { scale: 1.1, glowColor: "#88ccff", glowSize: 35 },
        },
        {
          offset: 0.3,
          properties: { scale: 1.05, glowColor: "#ccffff", glowSize: 25 },
        },
        { offset: 0.5, properties: { scale: 1.02, glowSize: 15 } },
        {
          offset: 1,
          properties: { scale: 1, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DIGITAL & FUTURISTIC
// ═══════════════════════════════════════════════════════════════════════════════

const cyberGlitch: ProfileEffect = {
  id: "preset-cyber-glitch",
  name: "Cyber Glitch",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 1400,
  layers: [
    {
      id: "glitch-avatar-red",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { x: 0, opacity: 0, color: "#ff003c" } },
        { offset: 0.05, properties: { x: -12, opacity: 0.8 } },
        { offset: 0.1, properties: { x: 8, opacity: 0.5 } },
        { offset: 0.15, properties: { x: -15, opacity: 0.9 } },
        { offset: 0.2, properties: { x: 5, opacity: 0.6 } },
        { offset: 0.25, properties: { x: -10, opacity: 0.7 } },
        { offset: 0.35, properties: { x: 0, opacity: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "glitch-avatar-blue",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { x: 0, opacity: 0, color: "#00f0ff" } },
        { offset: 0.05, properties: { x: 12, opacity: 0.8 } },
        { offset: 0.1, properties: { x: -8, opacity: 0.5 } },
        { offset: 0.15, properties: { x: 15, opacity: 0.9 } },
        { offset: 0.2, properties: { x: -5, opacity: 0.6 } },
        { offset: 0.25, properties: { x: 10, opacity: 0.7 } },
        { offset: 0.35, properties: { x: 0, opacity: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "glitch-hex",
      element: {
        type: "shape",
        shape: "hexagon",
        fill: "rgba(0,0,0,0)",
        stroke: "#00f0ff",
        size: 90,
      },
      keyframes: [
        { offset: 0, properties: { scale: 1, opacity: 0, rotation: 0 } },
        { offset: 0.05, properties: { scale: 1.3, opacity: 1, rotation: 30 } },
        {
          offset: 0.12,
          properties: { scale: 0.85, opacity: 0.4, rotation: -15 },
        },
        {
          offset: 0.18,
          properties: { scale: 1.5, opacity: 0.9, rotation: 60 },
        },
        {
          offset: 0.25,
          properties: { scale: 1.1, opacity: 0.5, rotation: 15 },
        },
        { offset: 0.35, properties: { scale: 0.9, opacity: 0, rotation: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "glitch-hex-2",
      element: {
        type: "shape",
        shape: "hexagon",
        fill: "rgba(0,0,0,0)",
        stroke: "#ff003c",
        size: 85,
      },
      keyframes: [
        { offset: 0, properties: { scale: 1.1, opacity: 0, rotation: 15 } },
        {
          offset: 0.08,
          properties: { scale: 1.2, opacity: 0.7, rotation: -20 },
        },
        {
          offset: 0.15,
          properties: { scale: 0.9, opacity: 0.3, rotation: 45 },
        },
        {
          offset: 0.22,
          properties: { scale: 1.4, opacity: 0.8, rotation: -30 },
        },
        { offset: 0.3, properties: { scale: 1, opacity: 0, rotation: 0 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 50,
      repeat: 0,
    },
    {
      id: "glitch-avatar-main",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1, x: 0, y: 0 } },
        { offset: 0.05, properties: { scale: 1.1, x: 3, y: -3 } },
        { offset: 0.1, properties: { scale: 0.95, x: -4, y: 4 } },
        { offset: 0.15, properties: { scale: 1.08, x: 5, y: 0 } },
        { offset: 0.2, properties: { scale: 0.97, x: -3, y: -2 } },
        { offset: 0.25, properties: { scale: 1.05, x: 2, y: 3 } },
        { offset: 0.35, properties: { scale: 1, x: 0, y: 0 } },
        { offset: 1, properties: { scale: 1 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
  ],
};

const neonPulse: ProfileEffect = {
  id: "preset-neon-pulse",
  name: "Neon Pulse",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 2500,
  layers: [
    {
      id: "neon-ring-1",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#ff00ff",
        stroke: "#ff44ff",
        size: 95,
      },
      keyframes: [
        {
          offset: 0,
          properties: {
            scale: 0.9,
            opacity: 0,
            glowColor: "#ff00ff",
            glowSize: 10,
          },
        },
        {
          offset: 0.15,
          properties: { scale: 1.05, opacity: 0.8, glowSize: 30 },
        },
        {
          offset: 0.3,
          properties: { scale: 0.95, opacity: 0.5, glowSize: 20 },
        },
        { offset: 0.5, properties: { scale: 1.1, opacity: 0.9, glowSize: 35 } },
        {
          offset: 0.7,
          properties: { scale: 0.98, opacity: 0.6, glowSize: 25 },
        },
        {
          offset: 0.85,
          properties: { scale: 1.05, opacity: 0.7, glowSize: 30 },
        },
        { offset: 1, properties: { scale: 0.9, opacity: 0, glowSize: 10 } },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "neon-ring-2",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#00ffff",
        stroke: "#44ffff",
        size: 110,
      },
      keyframes: [
        {
          offset: 0,
          properties: {
            scale: 1.1,
            opacity: 0,
            glowColor: "#00ffff",
            glowSize: 10,
          },
        },
        {
          offset: 0.2,
          properties: { scale: 0.95, opacity: 0.6, glowSize: 25 },
        },
        {
          offset: 0.4,
          properties: { scale: 1.08, opacity: 0.8, glowSize: 30 },
        },
        {
          offset: 0.6,
          properties: { scale: 0.92, opacity: 0.5, glowSize: 20 },
        },
        {
          offset: 0.8,
          properties: { scale: 1.05, opacity: 0.7, glowSize: 28 },
        },
        { offset: 1, properties: { scale: 1.1, opacity: 0, glowSize: 10 } },
      ],
      easing: "ease-in-out",
      delay: 100,
      repeat: 0,
    },
    {
      id: "neon-plasma",
      element: { type: "particle-preset", preset: "plasma" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 0.7 } },
        { offset: 0.85, properties: { opacity: 0.7 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "neon-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { scale: 1, glowColor: "#ff00ff", glowSize: 0 },
        },
        {
          offset: 0.15,
          properties: { scale: 1.03, glowColor: "#ff00ff", glowSize: 20 },
        },
        {
          offset: 0.35,
          properties: { scale: 0.98, glowColor: "#ff44ff", glowSize: 15 },
        },
        {
          offset: 0.5,
          properties: { scale: 1.04, glowColor: "#00ffff", glowSize: 25 },
        },
        {
          offset: 0.65,
          properties: { scale: 0.99, glowColor: "#44ffff", glowSize: 18 },
        },
        {
          offset: 0.85,
          properties: { scale: 1.02, glowColor: "#ff00ff", glowSize: 22 },
        },
        {
          offset: 1,
          properties: { scale: 1, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

const matrixRain: ProfileEffect = {
  id: "preset-matrix-rain",
  name: "Matrix Rain",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 3500,
  layers: [
    {
      id: "matrix-rain",
      element: { type: "particle-preset", preset: "snow" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.1, properties: { opacity: 1 } },
        { offset: 0.9, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "matrix-hex-1",
      element: {
        type: "shape",
        shape: "hexagon",
        fill: "rgba(0,0,0,0)",
        stroke: "#00ff00",
        size: 100,
      },
      keyframes: [
        { offset: 0, properties: { scale: 1.5, opacity: 0, rotation: 0 } },
        { offset: 0.2, properties: { scale: 1.1, opacity: 0.4, rotation: 30 } },
        { offset: 0.5, properties: { scale: 0.9, opacity: 0.6, rotation: 60 } },
        { offset: 0.8, properties: { scale: 1.2, opacity: 0.3, rotation: 90 } },
        { offset: 1, properties: { scale: 1.5, opacity: 0, rotation: 120 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "matrix-hex-2",
      element: {
        type: "shape",
        shape: "hexagon",
        fill: "rgba(0,0,0,0)",
        stroke: "#00aa00",
        size: 80,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0.8, opacity: 0, rotation: -15 } },
        { offset: 0.3, properties: { scale: 1.2, opacity: 0.5, rotation: 15 } },
        { offset: 0.6, properties: { scale: 1, opacity: 0.4, rotation: 45 } },
        { offset: 1, properties: { scale: 0.8, opacity: 0, rotation: 75 } },
      ],
      easing: "linear",
      delay: 200,
      repeat: 0,
    },
    {
      id: "matrix-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { scale: 1, glowColor: "#00ff00", glowSize: 0 },
        },
        { offset: 0.1, properties: { scale: 1.02, glowSize: 10 } },
        { offset: 0.15, properties: { scale: 0.98, y: -2 } },
        { offset: 0.25, properties: { scale: 1.01, y: 1, glowSize: 15 } },
        { offset: 0.35, properties: { scale: 0.99, y: -1 } },
        { offset: 0.5, properties: { scale: 1.02, glowSize: 12 } },
        { offset: 0.65, properties: { scale: 0.98, y: 2 } },
        { offset: 0.8, properties: { scale: 1.01, y: 0, glowSize: 8 } },
        {
          offset: 1,
          properties: { scale: 1, glowColor: "#000000", glowSize: 0 },
        },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DARK & MYSTERIOUS
// ═══════════════════════════════════════════════════════════════════════════════

const abyssalVoid: ProfileEffect = {
  id: "preset-abyssal-void",
  name: "Abyssal Void",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 4500,
  layers: [
    {
      id: "void-vortex",
      element: { type: "particle-preset", preset: "vortex" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 1 } },
        { offset: 0.85, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "void-spiral",
      element: {
        type: "shape",
        shape: "spiral",
        fill: "#1a0033",
        stroke: "#440088",
        size: 140,
      },
      keyframes: [
        { offset: 0, properties: { rotation: 0, scale: 1.6, opacity: 0 } },
        {
          offset: 0.2,
          properties: { rotation: 120, scale: 1.2, opacity: 0.6 },
        },
        {
          offset: 0.5,
          properties: { rotation: 360, scale: 0.8, opacity: 0.8 },
        },
        {
          offset: 0.8,
          properties: { rotation: 540, scale: 1.3, opacity: 0.5 },
        },
        { offset: 1, properties: { rotation: 720, scale: 1.6, opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "void-core",
      element: { type: "shape", shape: "circle", fill: "#000000", size: 75 },
      keyframes: [
        { offset: 0, properties: { scale: 0.7, opacity: 0 } },
        {
          offset: 0.2,
          properties: {
            scale: 1,
            opacity: 0.9,
            glowColor: "#440088",
            glowSize: 30,
          },
        },
        {
          offset: 0.5,
          properties: {
            scale: 1.15,
            opacity: 1,
            glowColor: "#8800ff",
            glowSize: 40,
          },
        },
        {
          offset: 0.8,
          properties: {
            scale: 0.9,
            opacity: 0.85,
            glowColor: "#440088",
            glowSize: 25,
          },
        },
        { offset: 1, properties: { scale: 0.6, opacity: 0 } },
      ],
      easing: "ease-in-out",
      delay: 100,
      repeat: 0,
    },
    {
      id: "void-smoke",
      element: { type: "particle-preset", preset: "smoke" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 0.6 } },
        { offset: 0.85, properties: { opacity: 0.6 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 200,
      repeat: 0,
    },
    {
      id: "void-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1, opacity: 1 } },
        {
          offset: 0.2,
          properties: {
            scale: 0.95,
            opacity: 0.9,
            glowColor: "#440088",
            glowSize: 15,
          },
        },
        {
          offset: 0.5,
          properties: {
            scale: 0.85,
            opacity: 0.6,
            glowColor: "#8800ff",
            glowSize: 25,
            blur: 3,
          },
        },
        { offset: 0.7, properties: { scale: 0.9, opacity: 0.75, blur: 2 } },
        { offset: 0.9, properties: { scale: 0.97, opacity: 0.95 } },
        {
          offset: 1,
          properties: {
            scale: 1,
            opacity: 1,
            glowColor: "#000000",
            glowSize: 0,
            blur: 0,
          },
        },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

const shadowBlade: ProfileEffect = {
  id: "preset-shadow-blade",
  name: "Shadow Blade",
  author_peer_id: "system",
  version: 1,
  trigger: "click",
  duration: 1500,
  layers: [
    {
      id: "blade-slash-1",
      element: {
        type: "shape",
        shape: "diamond",
        fill: "#330066",
        stroke: "#8800ff",
        size: 120,
      },
      keyframes: [
        {
          offset: 0,
          properties: { x: -60, y: -40, rotation: -45, scale: 0.2, opacity: 0 },
        },
        {
          offset: 0.1,
          properties: {
            x: 20,
            y: 20,
            rotation: 30,
            scale: 0.8,
            opacity: 1,
            glowColor: "#8800ff",
            glowSize: 20,
          },
        },
        {
          offset: 0.25,
          properties: {
            x: 60,
            y: 50,
            rotation: 75,
            scale: 0.3,
            opacity: 0,
            blur: 5,
          },
        },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "blade-slash-2",
      element: {
        type: "shape",
        shape: "diamond",
        fill: "#220044",
        stroke: "#aa44ff",
        size: 100,
      },
      keyframes: [
        {
          offset: 0,
          properties: { x: 50, y: -50, rotation: 45, scale: 0.2, opacity: 0 },
        },
        {
          offset: 0.15,
          properties: { x: 50, y: -50, rotation: 45, scale: 0.2, opacity: 0 },
        },
        {
          offset: 0.25,
          properties: {
            x: -10,
            y: 10,
            rotation: 120,
            scale: 0.7,
            opacity: 1,
            glowColor: "#aa44ff",
            glowSize: 18,
          },
        },
        {
          offset: 0.4,
          properties: {
            x: -50,
            y: 40,
            rotation: 180,
            scale: 0.25,
            opacity: 0,
            blur: 5,
          },
        },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "blade-shadow-burst",
      element: { type: "shape", shape: "circle", fill: "#110022", size: 100 },
      keyframes: [
        { offset: 0, properties: { scale: 0.5, opacity: 0, blur: 10 } },
        { offset: 0.15, properties: { scale: 1.2, opacity: 0.7, blur: 30 } },
        { offset: 0.4, properties: { scale: 1.8, opacity: 0.3, blur: 50 } },
        { offset: 0.7, properties: { scale: 2.2, opacity: 0, blur: 60 } },
        { offset: 1, properties: { scale: 2.5, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "blade-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { x: 0, y: 0, scale: 1 } },
        {
          offset: 0.08,
          properties: { x: -15, y: 5, scale: 0.9, rotation: -10 },
        },
        {
          offset: 0.15,
          properties: {
            x: 10,
            y: -10,
            scale: 1.15,
            rotation: 5,
            glowColor: "#8800ff",
            glowSize: 25,
          },
        },
        {
          offset: 0.25,
          properties: {
            x: 15,
            y: 5,
            scale: 1.1,
            rotation: 10,
            glowColor: "#aa44ff",
            glowSize: 20,
          },
        },
        {
          offset: 0.35,
          properties: { x: -8, y: 0, scale: 0.95, rotation: -5 },
        },
        {
          offset: 0.5,
          properties: {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
        { offset: 1, properties: { x: 0, y: 0, scale: 1 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CINEMATIC ENTRANCES
// ═══════════════════════════════════════════════════════════════════════════════

const celestialAscend: ProfileEffect = {
  id: "preset-celestial-ascend",
  name: "Celestial Ascend",
  author_peer_id: "system",
  version: 1,
  trigger: "entrance",
  duration: 1200,
  layers: [
    {
      id: "ascend-stars",
      element: { type: "particle-preset", preset: "stardust" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.2, properties: { opacity: 1 } },
        { offset: 0.8, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "ascend-ring",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#00eeff",
        stroke: "#88ffff",
        size: 90,
      },
      keyframes: [
        {
          offset: 0,
          properties: {
            scale: 0.3,
            opacity: 0,
            y: 60,
            glowColor: "#00eeff",
            glowSize: 15,
          },
        },
        {
          offset: 0.35,
          properties: { scale: 1.1, opacity: 0.9, y: 0, glowSize: 30 },
        },
        {
          offset: 0.6,
          properties: { scale: 1.6, opacity: 0.5, y: -20, glowSize: 20 },
        },
        {
          offset: 0.85,
          properties: { scale: 2.2, opacity: 0, y: -40, glowSize: 10 },
        },
        { offset: 1, properties: { scale: 2.5, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 100,
      repeat: 0,
    },
    {
      id: "ascend-star",
      element: { type: "shape", shape: "star", fill: "#ffffff", size: 70 },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, rotation: -90 } },
        { offset: 0.4, properties: { scale: 0.8, opacity: 0 } },
        {
          offset: 0.5,
          properties: {
            scale: 1.8,
            opacity: 0.8,
            rotation: 0,
            glowColor: "#ffffff",
            glowSize: 25,
          },
        },
        { offset: 0.7, properties: { scale: 2.5, opacity: 0.3, rotation: 45 } },
        { offset: 1, properties: { scale: 3.5, opacity: 0, rotation: 90 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "ascend-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { y: 80, opacity: 0, scale: 0.7, blur: 15 } },
        {
          offset: 0.3,
          properties: { y: 20, opacity: 0.5, scale: 0.85, blur: 8 },
        },
        {
          offset: 0.55,
          properties: {
            y: -8,
            opacity: 1,
            scale: 1.08,
            blur: 0,
            glowColor: "#ffffff",
            glowSize: 25,
          },
        },
        {
          offset: 0.75,
          properties: { y: 3, scale: 0.97, glowColor: "#00eeff", glowSize: 15 },
        },
        { offset: 0.9, properties: { y: -2, scale: 1.02 } },
        {
          offset: 1,
          properties: {
            y: 0,
            scale: 1,
            opacity: 1,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
      ],
      easing: { cubic: [0.22, 1, 0.36, 1] },
      delay: 0,
      repeat: 0,
    },
  ],
};

const phantomMaterialize: ProfileEffect = {
  id: "preset-phantom-materialize",
  name: "Phantom Materialize",
  author_peer_id: "system",
  version: 1,
  trigger: "entrance",
  duration: 1400,
  layers: [
    {
      id: "phantom-smoke",
      element: { type: "particle-preset", preset: "smoke" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.2, properties: { opacity: 0.9 } },
        { offset: 0.7, properties: { opacity: 0.7 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "phantom-ring-1",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#7700ff",
        stroke: "#9944ff",
        size: 100,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0.5, opacity: 0, y: -30, blur: 10 } },
        {
          offset: 0.25,
          properties: {
            scale: 1.1,
            opacity: 0.6,
            y: -10,
            blur: 5,
            glowColor: "#7700ff",
            glowSize: 20,
          },
        },
        {
          offset: 0.5,
          properties: { scale: 1.5, opacity: 0.3, y: 10, blur: 8 },
        },
        {
          offset: 0.75,
          properties: { scale: 1.8, opacity: 0, y: 20, blur: 15 },
        },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "phantom-ring-2",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#5500cc",
        stroke: "#7733ee",
        size: 80,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0.3, opacity: 0, y: -40, blur: 15 } },
        { offset: 0.15, properties: { scale: 0.3, opacity: 0 } },
        {
          offset: 0.35,
          properties: { scale: 1.0, opacity: 0.5, y: -15, blur: 6 },
        },
        {
          offset: 0.6,
          properties: { scale: 1.4, opacity: 0.2, y: 5, blur: 10 },
        },
        {
          offset: 0.85,
          properties: { scale: 1.7, opacity: 0, y: 15, blur: 18 },
        },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 100,
      repeat: 0,
    },
    {
      id: "phantom-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: {
            opacity: 0,
            scale: 1.3,
            blur: 25,
            y: -25,
            glowColor: "#7700ff",
            glowSize: 50,
          },
        },
        {
          offset: 0.25,
          properties: {
            opacity: 0.3,
            scale: 1.15,
            blur: 15,
            y: -15,
            glowSize: 35,
          },
        },
        {
          offset: 0.5,
          properties: {
            opacity: 0.6,
            scale: 1.08,
            blur: 8,
            y: -8,
            glowSize: 25,
          },
        },
        {
          offset: 0.75,
          properties: {
            opacity: 0.9,
            scale: 1.02,
            blur: 3,
            y: -2,
            glowSize: 15,
          },
        },
        {
          offset: 1,
          properties: {
            opacity: 1,
            scale: 1,
            blur: 0,
            y: 0,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
      ],
      easing: { cubic: [0.25, 0.8, 0.25, 1] },
      delay: 150,
      repeat: 0,
    },
  ],
};

const quantumFold: ProfileEffect = {
  id: "preset-quantum-fold",
  name: "Quantum Fold",
  author_peer_id: "system",
  version: 1,
  trigger: "entrance",
  duration: 1000,
  layers: [
    {
      id: "quantum-electric",
      element: { type: "particle-preset", preset: "electric" },
      keyframes: [
        { offset: 0, properties: { opacity: 1 } },
        { offset: 0.6, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "quantum-avatar-left",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { opacity: 0, scale: 0.3, rotation: -120, x: -100 },
        },
        {
          offset: 0.5,
          properties: { opacity: 0.5, scale: 0.9, rotation: -20, x: -20 },
        },
        {
          offset: 0.8,
          properties: { opacity: 0.3, scale: 1.05, rotation: 5, x: 5 },
        },
        { offset: 1, properties: { opacity: 0, scale: 1, rotation: 0, x: 0 } },
      ],
      easing: { cubic: [0.22, 1, 0.36, 1] },
      delay: 0,
      repeat: 0,
    },
    {
      id: "quantum-avatar-right",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { opacity: 0, scale: 0.3, rotation: 120, x: 100 },
        },
        {
          offset: 0.5,
          properties: { opacity: 0.4, scale: 0.9, rotation: 20, x: 20 },
        },
        {
          offset: 0.8,
          properties: { opacity: 0.2, scale: 1.05, rotation: -5, x: -5 },
        },
        { offset: 1, properties: { opacity: 0, scale: 1, rotation: 0, x: 0 } },
      ],
      easing: { cubic: [0.22, 1, 0.36, 1] },
      delay: 50,
      repeat: 0,
    },
    {
      id: "quantum-flare",
      element: { type: "shape", shape: "cross", fill: "#00ffcc", size: 120 },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, rotation: 0 } },
        { offset: 0.5, properties: { scale: 0, opacity: 0, rotation: 0 } },
        {
          offset: 0.6,
          properties: {
            scale: 1.8,
            opacity: 1,
            rotation: 45,
            glowColor: "#00ffcc",
            glowSize: 35,
          },
        },
        {
          offset: 0.8,
          properties: { scale: 2.5, opacity: 0.4, rotation: 90, glowSize: 20 },
        },
        { offset: 1, properties: { scale: 0, opacity: 0, rotation: 135 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "quantum-avatar-main",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { opacity: 0, scale: 0 } },
        { offset: 0.55, properties: { opacity: 0, scale: 0 } },
        {
          offset: 0.6,
          properties: {
            opacity: 1,
            scale: 1.2,
            glowColor: "#00ffcc",
            glowSize: 35,
          },
        },
        { offset: 0.75, properties: { scale: 0.95, glowSize: 20 } },
        { offset: 0.9, properties: { scale: 1.03, glowSize: 10 } },
        {
          offset: 1,
          properties: {
            opacity: 1,
            scale: 1,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
      ],
      easing: { cubic: [0.34, 1.4, 0.64, 1] },
      delay: 0,
      repeat: 0,
    },
  ],
};

const dimensionalRift: ProfileEffect = {
  id: "preset-dimensional-rift",
  name: "Dimensional Rift",
  author_peer_id: "system",
  version: 1,
  trigger: "entrance",
  duration: 1300,
  layers: [
    {
      id: "rift-cosmos",
      element: { type: "particle-preset", preset: "cosmos" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.15, properties: { opacity: 1 } },
        { offset: 0.75, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "rift-tear",
      element: {
        type: "shape",
        shape: "diamond",
        fill: "#ffffff",
        stroke: "#00ffff",
        size: 10,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, y: 0 } },
        {
          offset: 0.15,
          properties: {
            scale: 0.5,
            opacity: 1,
            glowColor: "#ffffff",
            glowSize: 30,
          },
        },
        { offset: 0.35, properties: { scale: 1, opacity: 1, glowSize: 50 } },
        { offset: 0.5, properties: { scale: 0.8, opacity: 0.8, glowSize: 40 } },
        { offset: 0.7, properties: { scale: 0.3, opacity: 0.5, glowSize: 20 } },
        { offset: 1, properties: { scale: 0, opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "rift-portal-1",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#00ffcc",
        stroke: "#44ffdd",
        size: 90,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, rotation: 0 } },
        { offset: 0.2, properties: { scale: 0, opacity: 0 } },
        {
          offset: 0.35,
          properties: {
            scale: 1.2,
            opacity: 0.9,
            rotation: 60,
            glowColor: "#00ffcc",
            glowSize: 25,
          },
        },
        {
          offset: 0.6,
          properties: { scale: 1.8, opacity: 0.4, rotation: 120 },
        },
        { offset: 0.85, properties: { scale: 2.5, opacity: 0, rotation: 180 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "ease-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "rift-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 0, opacity: 0, blur: 20 } },
        { offset: 0.3, properties: { scale: 0.2, opacity: 0 } },
        {
          offset: 0.45,
          properties: {
            scale: 0.8,
            opacity: 0.7,
            blur: 10,
            glowColor: "#00ffcc",
            glowSize: 40,
          },
        },
        {
          offset: 0.6,
          properties: { scale: 1.15, opacity: 1, blur: 3, glowSize: 30 },
        },
        { offset: 0.8, properties: { scale: 0.97, blur: 0, glowSize: 15 } },
        { offset: 0.95, properties: { scale: 1.02 } },
        {
          offset: 1,
          properties: {
            scale: 1,
            opacity: 1,
            glowColor: "#000000",
            glowSize: 0,
          },
        },
      ],
      easing: { cubic: [0.22, 1, 0.36, 1] },
      delay: 200,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// MINIMAL & ELEGANT
// ═══════════════════════════════════════════════════════════════════════════════

const gentleGlow: ProfileEffect = {
  id: "preset-gentle-glow",
  name: "Gentle Glow",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 2000,
  layers: [
    {
      id: "glow-ring",
      element: {
        type: "shape",
        shape: "ring",
        fill: "#ffffff",
        stroke: "#ffffff",
        size: 90,
      },
      keyframes: [
        { offset: 0, properties: { scale: 0.9, opacity: 0 } },
        {
          offset: 0.3,
          properties: {
            scale: 1.05,
            opacity: 0.4,
            glowColor: "#ffffff",
            glowSize: 15,
          },
        },
        {
          offset: 0.6,
          properties: { scale: 1.1, opacity: 0.25, glowSize: 20 },
        },
        { offset: 1, properties: { scale: 1.2, opacity: 0 } },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
    {
      id: "glow-sparkle",
      element: { type: "particle-preset", preset: "sparkle" },
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 0.2, properties: { opacity: 0.6 } },
        { offset: 0.8, properties: { opacity: 0.6 } },
        { offset: 1, properties: { opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "glow-avatar",
      element: { type: "avatar" },
      keyframes: [
        {
          offset: 0,
          properties: { scale: 1, glowColor: "#ffffff", glowSize: 0 },
        },
        { offset: 0.4, properties: { scale: 1.02, glowSize: 15 } },
        { offset: 0.7, properties: { scale: 1.01, glowSize: 10 } },
        { offset: 1, properties: { scale: 1, glowSize: 0 } },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

const orbitalCascade: ProfileEffect = {
  id: "preset-orbital-cascade",
  name: "Orbital Cascade",
  author_peer_id: "system",
  version: 1,
  trigger: "hover",
  duration: 4500,
  layers: [
    {
      id: "orbit-ring",
      element: {
        type: "shape",
        shape: "ring",
        fill: "rgba(255, 215, 0, 0.2)",
        stroke: "#ffd700",
        size: 95,
      },
      keyframes: [
        { offset: 0, properties: { rotation: 0, scale: 1, opacity: 0 } },
        {
          offset: 0.15,
          properties: { rotation: 54, scale: 1.05, opacity: 0.6 },
        },
        {
          offset: 0.5,
          properties: { rotation: 180, scale: 1.1, opacity: 0.5, y: -5 },
        },
        {
          offset: 0.85,
          properties: { rotation: 306, scale: 1.05, opacity: 0.6 },
        },
        { offset: 1, properties: { rotation: 360, scale: 1, opacity: 0 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "orbit-moon-1",
      element: { type: "shape", shape: "circle", fill: "#ffd700", size: 12 },
      keyframes: [
        {
          offset: 0,
          properties: {
            x: 48,
            y: 0,
            scale: 1,
            glowColor: "#ffd700",
            glowSize: 10,
          },
        },
        {
          offset: 0.125,
          properties: { x: 34, y: 34, scale: 1.3, glowSize: 15 },
        },
        { offset: 0.25, properties: { x: 0, y: 48, scale: 0.7, glowSize: 8 } },
        {
          offset: 0.375,
          properties: { x: -34, y: 34, scale: 1.2, glowSize: 12 },
        },
        { offset: 0.5, properties: { x: -48, y: 0, scale: 1.4, glowSize: 18 } },
        {
          offset: 0.625,
          properties: { x: -34, y: -34, scale: 1.1, glowSize: 14 },
        },
        { offset: 0.75, properties: { x: 0, y: -48, scale: 0.6, glowSize: 6 } },
        {
          offset: 0.875,
          properties: { x: 34, y: -34, scale: 1.15, glowSize: 11 },
        },
        { offset: 1, properties: { x: 48, y: 0, scale: 1, glowSize: 10 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "orbit-moon-2",
      element: { type: "shape", shape: "circle", fill: "#ffaa00", size: 8 },
      keyframes: [
        { offset: 0, properties: { x: -48, y: 0, scale: 1 } },
        { offset: 0.125, properties: { x: -34, y: -34, scale: 0.8 } },
        { offset: 0.25, properties: { x: 0, y: -48, scale: 1.2 } },
        { offset: 0.375, properties: { x: 34, y: -34, scale: 0.9 } },
        { offset: 0.5, properties: { x: 48, y: 0, scale: 1.1 } },
        { offset: 0.625, properties: { x: 34, y: 34, scale: 0.85 } },
        { offset: 0.75, properties: { x: 0, y: 48, scale: 1.15 } },
        { offset: 0.875, properties: { x: -34, y: 34, scale: 0.95 } },
        { offset: 1, properties: { x: -48, y: 0, scale: 1 } },
      ],
      easing: "linear",
      delay: 0,
      repeat: 0,
    },
    {
      id: "orbit-avatar",
      element: { type: "avatar" },
      keyframes: [
        { offset: 0, properties: { scale: 1 } },
        { offset: 0.25, properties: { scale: 0.98 } },
        { offset: 0.5, properties: { scale: 1.02 } },
        { offset: 0.75, properties: { scale: 0.99 } },
        { offset: 1, properties: { scale: 1 } },
      ],
      easing: "ease-in-out",
      delay: 0,
      repeat: 0,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: "ethereal",
    name: "Ethereal & Transcendent",
    presets: [etherealAwakening, cosmicDreamer, divineRadiance],
  },
  {
    id: "explosive",
    name: "Explosive & Powerful",
    presets: [superNova, thunderGod, plasmaVortex, infernalStrike],
  },
  {
    id: "romantic",
    name: "Delicate & Romantic",
    presets: [sakuraBloom, loveSpell, frostNova],
  },
  {
    id: "digital",
    name: "Digital & Futuristic",
    presets: [cyberGlitch, neonPulse, matrixRain],
  },
  {
    id: "dark",
    name: "Dark & Mysterious",
    presets: [abyssalVoid, shadowBlade],
  },
  {
    id: "entrance",
    name: "Cinematic Entrances",
    presets: [
      celestialAscend,
      phantomMaterialize,
      quantumFold,
      dimensionalRift,
    ],
  },
  {
    id: "minimal",
    name: "Minimal & Elegant",
    presets: [gentleGlow, orbitalCascade],
  },
];

// flat list of all presets for quick lookup
export const ALL_PRESETS: ProfileEffect[] = PRESET_CATEGORIES.flatMap(
  (cat) => cat.presets,
);
