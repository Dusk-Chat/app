// svg shape definitions for all 12 element types used in the profile effects system
// each shape is designed in a 100x100 viewbox, centered, with hand-optimized path data

import type { Component } from "solid-js";
import { For } from "solid-js";
import type { ShapeType } from "./effects";

export interface ShapePath {
  d: string;
  fill?: boolean;
  stroke?: boolean;
  strokeWidth?: number;
}

export interface ShapeDef {
  viewBox: string;
  paths: ShapePath[];
}

// -- shape definitions --

const circle: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 5a45 45 0 1 0 0 90a45 45 0 1 0 0-90Z",
      fill: true,
    },
  ],
};

const ring: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 5a45 45 0 1 0 0 90a45 45 0 1 0 0-90Z",
      fill: false,
      stroke: true,
      strokeWidth: 6,
    },
  ],
};

// 5-pointed star using pre-calculated inner/outer vertices
const star: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 5L61.8 38.2L97.6 38.2L68.9 58.8L80.9 91.8L50 72L19.1 91.8L31.1 58.8L2.4 38.2L38.2 38.2Z",
      fill: true,
    },
  ],
};

const diamond: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 5L95 50L50 95L5 50Z",
      fill: true,
    },
  ],
};

// regular hexagon with flat top
const hexagon: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M25 6.7L75 6.7L100 50L75 93.3L25 93.3L0 50Z",
      fill: true,
    },
  ],
};

// equilateral triangle pointing up
const triangle: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 5L95 90L5 90Z",
      fill: true,
    },
  ],
};

// classic heart using cubic bezier curves
const heart: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 88C50 88 10 62 10 35C10 18 22 8 35 8C42 8 48 12 50 18C52 12 58 8 65 8C78 8 90 18 90 35C90 62 50 88 50 88Z",
      fill: true,
    },
  ],
};

// lightning bolt shape
const lightning: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M58 5L25 52L45 52L38 95L75 42L55 42Z",
      fill: true,
    },
  ],
};

// crescent moon facing right
const crescent: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M60 5A45 45 0 1 0 60 95A35 35 0 1 1 60 5Z",
      fill: true,
    },
  ],
};

// plus/cross shape
const cross: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M35 5L65 5L65 35L95 35L95 65L65 65L65 95L35 95L35 65L5 65L5 35L35 35Z",
      fill: true,
    },
  ],
};

// logarithmic spiral, stroke only
const spiral: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 50C50 42 56 36 64 36C76 36 84 46 84 58C84 74 72 86 56 86C36 86 22 72 22 52C22 28 38 12 62 12",
      fill: false,
      stroke: true,
      strokeWidth: 5,
    },
  ],
};

// starburst / sunburst with 12 points
const burst: ShapeDef = {
  viewBox: "0 0 100 100",
  paths: [
    {
      d: "M50 5L56 30L75 7L64 31L93 18L70 36L97 38L72 44L95 57L68 52L87 75L62 58L75 87L56 64L62 93L50 68L38 93L44 64L25 87L38 58L13 75L32 52L5 57L28 44L3 38L30 36L7 18L36 31L25 7L44 30Z",
      fill: true,
    },
  ],
};

export const SHAPE_DEFS: Record<ShapeType, ShapeDef> = {
  circle,
  ring,
  star,
  diamond,
  hexagon,
  triangle,
  heart,
  lightning,
  crescent,
  cross,
  spiral,
  burst,
};

// -- renderer component --

interface ShapeRendererProps {
  shape: ShapeType;
  size: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  class?: string;
  style?: Record<string, string>;
}

const ShapeRenderer: Component<ShapeRendererProps> = (props) => {
  const def = () => SHAPE_DEFS[props.shape];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={def().viewBox}
      width={props.size}
      height={props.size}
      class={props.class}
      style={props.style}
    >
      <For each={def().paths}>
        {(path) => (
          <path
            d={path.d}
            fill={path.fill !== false ? props.fill : "none"}
            stroke={path.stroke ? (props.stroke ?? props.fill) : "none"}
            stroke-width={path.stroke ? (props.strokeWidth ?? path.strokeWidth ?? 2) : undefined}
            stroke-linecap={path.stroke ? "round" : undefined}
            stroke-linejoin={path.stroke ? "round" : undefined}
          />
        )}
      </For>
    </svg>
  );
};

export default ShapeRenderer;
