// canvas-based particle system for profile effect overlays
// each preset defines spawn, update, and draw behavior for a distinct visual style
// enhanced with advanced physics, organic motion, and visual intricacy

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  baseOpacity: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotationSpeed: number;
  // extended properties for advanced effects
  z?: number; // depth for parallax
  phase?: number; // unique phase offset for organic motion
  scale?: number; // individual scale factor
  hue?: number; // for color cycling
  trail?: Array<{ x: number; y: number; opacity: number }>; // motion trails
  charge?: number; // for electric effects
  forkAngle?: number; // for branching effects
  turbulence?: number; // chaos factor
  targetX?: number; // for attraction effects
  targetY?: number;
}

export interface ParticleConfig {
  count: number;
  spawnArea: { x: number; y: number; width: number; height: number };
  gravity: number;
  colors: string[];
  sizeRange: [number, number];
  speedRange: [number, number];
  lifetimeRange: [number, number];
  fadeIn: number;
  fadeOut: number;
  init?: (p: Particle, i: number, config: ParticleConfig) => void;
  update?: (p: Particle, dt: number) => void;
  draw?: (ctx: CanvasRenderingContext2D, p: Particle) => void;
}

// --- helpers ---

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// compute display opacity from base opacity and life progress fade in/out
function computeOpacity(p: Particle, fadeIn: number, fadeOut: number): number {
  const progress = p.life / p.maxLife;
  let fade = 1;
  if (progress < fadeIn && fadeIn > 0) {
    fade = progress / fadeIn;
  } else if (progress > 1 - fadeOut && fadeOut > 0) {
    fade = (1 - progress) / fadeOut;
  }
  return p.baseOpacity * fade;
}

// --- presets ---

const embers: ParticleConfig = {
  count: 80,
  spawnArea: { x: 0, y: 0.85, width: 1, height: 0.15 },
  gravity: -20,
  colors: ["#ff4f00", "#ff6a00", "#ff3300", "#ff8800", "#cc3300"],
  sizeRange: [1.5, 4],
  speedRange: [8, 25],
  lifetimeRange: [1.5, 3.5],
  fadeIn: 0.15,
  fadeOut: 0.4,
  init(p, _i, config) {
    p.vx = rand(-8, 8);
    p.vy = -rand(config.speedRange[0], config.speedRange[1]);
  },
  update(p, dt) {
    // gentle horizontal sway using sine wave
    p.vx += Math.sin(p.life * 3) * 15 * dt;
  },
  draw(ctx, p) {
    const alpha = p.opacity;
    // soft glow layer
    const gradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      p.size * 3,
    );
    gradient.addColorStop(0, hexToRgba(p.color, alpha * 0.3));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
    ctx.fill();

    // bright core
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

const confetti: ParticleConfig = {
  count: 120,
  spawnArea: { x: 0, y: -0.05, width: 1, height: 0.1 },
  gravity: 80,
  colors: ["#ff4f00", "#00cc66", "#aa44ff", "#00cccc", "#ffcc00", "#ff66aa"],
  sizeRange: [3, 6],
  speedRange: [20, 60],
  lifetimeRange: [2, 4],
  fadeIn: 0.05,
  fadeOut: 0.3,
  init(p, _i, config) {
    p.vx = rand(-30, 30);
    p.vy = rand(config.speedRange[0], config.speedRange[1]);
    p.rotationSpeed = rand(-400, 400);
  },
  update(p, dt) {
    // wobble side to side as it falls
    p.vx += Math.sin(p.life * 5 + p.rotation * 0.01) * 40 * dt;
    // air resistance on horizontal movement
    p.vx *= 1 - 1.5 * dt;
  },
  draw(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    // rectangular confetti piece with foreshortening from rotation
    const w = p.size;
    const h = p.size * 0.6;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

const sparkle: ParticleConfig = {
  count: 70,
  spawnArea: { x: 0, y: 0, width: 1, height: 1 },
  gravity: 0,
  colors: ["#ffffff", "#fffbe6", "#ffd700", "#fff5cc"],
  sizeRange: [2, 5],
  speedRange: [0, 2],
  lifetimeRange: [0.3, 0.8],
  fadeIn: 0.3,
  fadeOut: 0.4,
  init(p) {
    // sparkles are mostly stationary
    p.vx = rand(-2, 2);
    p.vy = rand(-2, 2);
  },
  draw(ctx, p) {
    // 4-pointed star shape
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;

    const s = p.size;
    const inner = s * 0.3;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const outerX = Math.cos(angle) * s;
      const outerY = Math.sin(angle) * s;
      const midAngle = angle + Math.PI / 4;
      const innerX = Math.cos(midAngle) * inner;
      const innerY = Math.sin(midAngle) * inner;
      if (i === 0) {
        ctx.moveTo(outerX, outerY);
      } else {
        ctx.lineTo(outerX, outerY);
      }
      ctx.lineTo(innerX, innerY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

const snow: ParticleConfig = {
  count: 100,
  spawnArea: { x: 0, y: -0.05, width: 1, height: 0.1 },
  gravity: 15,
  colors: ["#ffffff", "#e8e8e8", "#f0f0f0", "#dcdcdc"],
  sizeRange: [1.5, 4],
  speedRange: [10, 25],
  lifetimeRange: [3, 6],
  fadeIn: 0.1,
  fadeOut: 0.3,
  init(p, _i, config) {
    p.vx = rand(-5, 5);
    p.vy = rand(config.speedRange[0], config.speedRange[1]);
  },
  update(p, dt) {
    // horizontal drift using sine wave for natural sway
    p.vx += Math.sin(p.life * 2 + p.x * 0.05) * 12 * dt;
    p.vx *= 1 - 0.5 * dt;
  },
};

const fireflies: ParticleConfig = {
  count: 40,
  spawnArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  gravity: 0,
  colors: ["#66ff66", "#88ff44", "#aaff00", "#ccff66"],
  sizeRange: [2, 3.5],
  speedRange: [5, 15],
  lifetimeRange: [2, 5],
  fadeIn: 0.2,
  fadeOut: 0.3,
  init(p, _i, config) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(config.speedRange[0], config.speedRange[1]);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
  },
  update(p, dt) {
    // random wandering by nudging velocity
    p.vx += rand(-30, 30) * dt;
    p.vy += rand(-30, 30) * dt;
    // dampen to keep from flying away
    const damping = 1 - 2 * dt;
    p.vx *= damping;
    p.vy *= damping;
    // pulsing brightness
    p.baseOpacity = 0.4 + 0.6 * Math.abs(Math.sin(p.life * 4 + p.x * 0.1));
  },
  draw(ctx, p) {
    const alpha = p.opacity;
    // outer glow
    const gradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      p.size * 4,
    );
    gradient.addColorStop(0, `rgba(100, 255, 80, ${alpha * 0.2})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
    ctx.fill();

    // bright core
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

const smoke: ParticleConfig = {
  count: 50,
  spawnArea: { x: 0.2, y: 0.7, width: 0.6, height: 0.2 },
  gravity: -8,
  colors: ["#666666", "#888888", "#555555", "#777777", "#999999"],
  sizeRange: [4, 8],
  speedRange: [5, 12],
  lifetimeRange: [2, 4],
  fadeIn: 0.2,
  fadeOut: 0.5,
  init(p, _i, config) {
    p.vx = rand(-4, 4);
    p.vy = -rand(config.speedRange[0], config.speedRange[1]);
  },
  update(p, dt) {
    // expand as it rises
    p.size += 6 * dt;
    // gentle horizontal drift
    p.vx += Math.sin(p.life * 1.5) * 3 * dt;
  },
  draw(ctx, p) {
    ctx.globalAlpha = p.opacity * 0.6;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

// === ENHANCED PARTICLE PRESETS ===

// aurora - flowing northern lights with organic ribbon motion
const aurora: ParticleConfig = {
  count: 60,
  spawnArea: { x: 0, y: 0.2, width: 1, height: 0.3 },
  gravity: 0,
  colors: ["#00ff88", "#00ffcc", "#44ff99", "#00ddff", "#88ffaa", "#00ffaa"],
  sizeRange: [20, 50],
  speedRange: [2, 8],
  lifetimeRange: [3, 6],
  fadeIn: 0.3,
  fadeOut: 0.4,
  init(p) {
    p.phase = rand(0, Math.PI * 2);
    p.vx = rand(-3, 3);
    p.vy = rand(-1, 1);
    p.turbulence = rand(1, 3);
    p.scale = rand(0.5, 1.5);
    p.trail = [];
  },
  update(p, dt) {
    // organic wave movement
    const waveFreq = 0.8 + (p.turbulence ?? 1) * 0.2;
    const waveAmp = 30 + (p.turbulence ?? 1) * 20;
    p.vx += Math.sin(p.life * waveFreq + (p.phase ?? 0)) * waveAmp * dt;
    p.vy += Math.cos(p.life * waveFreq * 0.7 + (p.phase ?? 0)) * 10 * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;

    // trailing effect
    if (p.trail) {
      p.trail.unshift({ x: p.x, y: p.y, opacity: p.opacity });
      if (p.trail.length > 12) p.trail.pop();
    }

    // shimmer
    p.baseOpacity = 0.3 + 0.4 * Math.abs(Math.sin(p.life * 2 + (p.phase ?? 0)));
  },
  draw(ctx, p) {
    // draw ribbon trail
    if (p.trail && p.trail.length > 2) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 1; i < p.trail.length; i++) {
        const t = p.trail[i];
        const prev = p.trail[i - 1];
        const trailOpacity = p.opacity * (1 - i / p.trail.length) * 0.6;
        const gradient = ctx.createLinearGradient(prev.x, prev.y, t.x, t.y);
        gradient.addColorStop(0, hexToRgba(p.color, trailOpacity));
        gradient.addColorStop(1, hexToRgba(p.color, trailOpacity * 0.5));
        ctx.strokeStyle = gradient;
        ctx.lineWidth =
          p.size * (p.scale ?? 1) * (1 - (i / p.trail.length) * 0.5);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // glow core
    const gradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      p.size * (p.scale ?? 1),
    );
    gradient.addColorStop(0, hexToRgba(p.color, p.opacity * 0.8));
    gradient.addColorStop(0.4, hexToRgba(p.color, p.opacity * 0.3));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.scale ?? 1), 0, Math.PI * 2);
    ctx.fill();
  },
};

// petals - cherry blossom with realistic tumbling physics and air resistance
const petals: ParticleConfig = {
  count: 45,
  spawnArea: { x: -0.1, y: -0.1, width: 1.2, height: 0.3 },
  gravity: 35,
  colors: ["#ffb7c5", "#ffc0cb", "#ffaabb", "#ffd4dc", "#ff99aa", "#ffeef1"],
  sizeRange: [6, 12],
  speedRange: [15, 40],
  lifetimeRange: [3, 5],
  fadeIn: 0.1,
  fadeOut: 0.3,
  init(p, _i, config) {
    p.vx = rand(10, 40);
    p.vy = rand(config.speedRange[0], config.speedRange[1]);
    p.rotationSpeed = rand(-300, 300);
    p.phase = rand(0, Math.PI * 2);
    p.scale = rand(0.6, 1.4);
    p.turbulence = rand(0.5, 2);
  },
  update(p, dt) {
    // realistic flutter with multi-frequency oscillation
    const flutter1 = Math.sin(p.life * 5 + (p.phase ?? 0)) * 60;
    const flutter2 = Math.sin(p.life * 2.3 + (p.phase ?? 0) * 1.5) * 30;
    const flutter3 = Math.cos(p.life * 8.7 + (p.phase ?? 0) * 0.7) * 15;
    p.vx += (flutter1 + flutter2 + flutter3) * (p.turbulence ?? 1) * dt;

    // air resistance varies with rotation (simulating petal orientation)
    const orientationDrag =
      0.5 + 0.5 * Math.abs(Math.sin((p.rotation * Math.PI) / 180));
    p.vy *= 1 - orientationDrag * 0.8 * dt;
    p.vx *= 1 - 1.5 * dt;

    // tumbling rotation acceleration
    p.rotationSpeed += Math.sin(p.life * 3) * 200 * dt;
    p.rotationSpeed *= 0.98;
  },
  draw(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = p.opacity;

    // petal shape - organic curved form
    const scale = p.scale ?? 1;
    const w = p.size * scale;
    const h = p.size * 0.6 * scale;

    // gradient for depth
    const gradient = ctx.createRadialGradient(-w * 0.3, -h * 0.2, 0, 0, 0, w);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.3, p.color);
    gradient.addColorStop(1, hexToRgba(p.color, 0.7));
    ctx.fillStyle = gradient;

    // draw petal with bezier curves
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(w * 0.8, -h * 0.5, w * 0.8, h * 0.5, 0, h);
    ctx.bezierCurveTo(-w * 0.8, h * 0.5, -w * 0.8, -h * 0.5, 0, -h);
    ctx.fill();

    // subtle vein
    ctx.strokeStyle = hexToRgba("#ff88aa", p.opacity * 0.3);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.8);
    ctx.lineTo(0, h * 0.8);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

// stardust - cosmic particles with depth parallax and twinkling
const stardust: ParticleConfig = {
  count: 120,
  spawnArea: { x: 0, y: 0, width: 1, height: 1 },
  gravity: 0,
  colors: ["#ffffff", "#aaccff", "#ffddaa", "#ddaaff", "#aaffdd", "#ffaacc"],
  sizeRange: [1, 4],
  speedRange: [1, 5],
  lifetimeRange: [2, 5],
  fadeIn: 0.2,
  fadeOut: 0.3,
  init(p) {
    p.z = rand(0.3, 1); // depth layer
    p.phase = rand(0, Math.PI * 2);
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1, 5) * (p.z ?? 1);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.size *= p.z ?? 1; // smaller when further
    p.hue = rand(0, 360);
  },
  update(p, dt) {
    // parallax drift
    const driftSpeed = (p.z ?? 1) * 0.5;
    p.vx += Math.sin(p.life * 0.5 + (p.phase ?? 0)) * 3 * driftSpeed * dt;
    p.vy += Math.cos(p.life * 0.3 + (p.phase ?? 0)) * 3 * driftSpeed * dt;
    p.vx *= 0.99;
    p.vy *= 0.99;

    // twinkle with varied frequency based on depth
    const twinkleFreq = 3 + (1 - (p.z ?? 1)) * 5;
    p.baseOpacity =
      0.3 +
      0.7 *
        Math.pow(Math.abs(Math.sin(p.life * twinkleFreq + (p.phase ?? 0))), 2);
  },
  draw(ctx, p) {
    const alpha = p.opacity;
    const depth = p.z ?? 1;

    // outer glow proportional to depth
    const glowSize = p.size * (3 + depth * 2);
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
    gradient.addColorStop(0, hexToRgba(p.color, alpha * 0.8 * depth));
    gradient.addColorStop(0.3, hexToRgba(p.color, alpha * 0.3 * depth));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // draw 4-point twinkle for brighter stars
    if (depth > 0.6) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(((p.life * 50 + (p.phase ?? 0)) * Math.PI) / 180);
      ctx.globalAlpha = alpha * depth;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 0.5;
      const rayLen = p.size * 2;
      ctx.beginPath();
      ctx.moveTo(-rayLen, 0);
      ctx.lineTo(rayLen, 0);
      ctx.moveTo(0, -rayLen);
      ctx.lineTo(0, rayLen);
      ctx.stroke();
      ctx.restore();
    }

    // bright core
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

// plasma - flowing energy orbs with organic pulsing
const plasma: ParticleConfig = {
  count: 35,
  spawnArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  gravity: 0,
  colors: ["#ff00ff", "#ff44aa", "#aa00ff", "#ff0088", "#cc00ff", "#ff00cc"],
  sizeRange: [8, 20],
  speedRange: [5, 15],
  lifetimeRange: [2, 4],
  fadeIn: 0.2,
  fadeOut: 0.3,
  init(p, _i, config) {
    p.phase = rand(0, Math.PI * 2);
    const angle = rand(0, Math.PI * 2);
    const speed = rand(config.speedRange[0], config.speedRange[1]);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.scale = rand(0.5, 1.5);
    p.targetX = rand(0.3, 0.7);
    p.targetY = rand(0.3, 0.7);
  },
  update(p, dt) {
    // gentle attraction toward random target (creates organic clustering)
    const attractStrength = 20;
    p.vx += ((p.targetX ?? 0.5) * 100 - p.x) * attractStrength * 0.001;
    p.vy += ((p.targetY ?? 0.5) * 100 - p.y) * attractStrength * 0.001;

    // organic drift
    p.vx += Math.sin(p.life * 2 + (p.phase ?? 0)) * 15 * dt;
    p.vy += Math.cos(p.life * 1.7 + (p.phase ?? 0) * 1.3) * 15 * dt;

    // damping
    p.vx *= 0.97;
    p.vy *= 0.97;

    // pulsing size
    p.scale = 0.7 + 0.5 * Math.sin(p.life * 3 + (p.phase ?? 0));
  },
  draw(ctx, p) {
    const scale = p.scale ?? 1;
    const size = p.size * scale;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // outer plasma glow
    const gradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      size * 2.5,
    );
    gradient.addColorStop(0, hexToRgba(p.color, p.opacity * 0.9));
    gradient.addColorStop(0.2, hexToRgba(p.color, p.opacity * 0.5));
    gradient.addColorStop(0.5, hexToRgba(p.color, p.opacity * 0.2));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // inner bright core
    const coreGradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      size * 0.8,
    );
    coreGradient.addColorStop(0, hexToRgba("#ffffff", p.opacity));
    coreGradient.addColorStop(0.5, hexToRgba(p.color, p.opacity * 0.8));
    coreGradient.addColorStop(1, hexToRgba(p.color, 0));
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },
};

// electric - lightning arcs with forking and crackling
const electric: ParticleConfig = {
  count: 25,
  spawnArea: { x: 0.3, y: 0.1, width: 0.4, height: 0.2 },
  gravity: 80,
  colors: ["#00eeff", "#ffffff", "#88ffff", "#aaffff", "#00ccff"],
  sizeRange: [1, 2],
  speedRange: [80, 150],
  lifetimeRange: [0.2, 0.5],
  fadeIn: 0.1,
  fadeOut: 0.5,
  init(p, _i, config) {
    p.vy = rand(config.speedRange[0], config.speedRange[1]);
    p.vx = rand(-30, 30);
    p.charge = rand(3, 8); // number of segments
    p.forkAngle = rand(20, 60);
    p.trail = [];
    p.turbulence = rand(10, 30); // zigzag amplitude
  },
  update(p, _dt) {
    // sharp zigzag motion
    if (Math.random() < 0.3) {
      p.vx = rand(-80, 80);
    }

    // record trail for lightning bolt rendering
    if (p.trail && p.trail.length < 20) {
      p.trail.push({ x: p.x, y: p.y, opacity: 1 });
    }
  },
  draw(ctx, p) {
    if (!p.trail || p.trail.length < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // main bolt
    ctx.strokeStyle = hexToRgba(p.color, p.opacity);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(p.trail[0].x, p.trail[0].y);
    for (let i = 1; i < p.trail.length; i++) {
      ctx.lineTo(p.trail[i].x, p.trail[i].y);
    }
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // glow layer
    ctx.shadowBlur = 20;
    ctx.strokeStyle = hexToRgba("#ffffff", p.opacity * 0.5);
    ctx.lineWidth = 4;
    ctx.stroke();

    // fork at random points
    const forks = Math.floor((p.charge ?? 5) / 2);
    for (let f = 0; f < forks; f++) {
      const idx = Math.floor(rand(1, p.trail.length - 1));
      const pt = p.trail[idx];
      if (!pt) continue;

      const angle = (((p.forkAngle ?? 45) + rand(-20, 20)) * Math.PI) / 180;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const len = rand(10, 25);

      ctx.strokeStyle = hexToRgba(p.color, p.opacity * 0.6);
      ctx.lineWidth = 1;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(
        pt.x + Math.cos(angle) * len * dir,
        pt.y + Math.sin(angle) * len,
      );
      ctx.stroke();
    }

    ctx.restore();
  },
};

// glitter - dense micro-sparkles with rainbow prismatic reflections
const glitter: ParticleConfig = {
  count: 200,
  spawnArea: { x: 0, y: 0, width: 1, height: 1 },
  gravity: 15,
  colors: ["#ffffff"], // we'll generate rainbow colors dynamically
  sizeRange: [1, 3],
  speedRange: [5, 20],
  lifetimeRange: [0.5, 1.5],
  fadeIn: 0.1,
  fadeOut: 0.4,
  init(p) {
    p.hue = rand(0, 360);
    p.phase = rand(0, Math.PI * 2);
    p.vx = rand(-20, 20);
    p.vy = rand(-10, 30);
    p.z = rand(0.5, 1);
    p.rotationSpeed = rand(-500, 500);
  },
  update(p, dt) {
    // rapid color shift
    p.hue = ((p.hue ?? 0) + 300 * dt) % 360;

    // flash on and off rapidly
    const flash = Math.sin(p.life * 20 + (p.phase ?? 0));
    p.baseOpacity = flash > 0.7 ? 1 : flash > 0.3 ? 0.4 : 0.1;

    // gentle drift
    p.vx += Math.sin(p.life * 5) * 10 * dt;
    p.vx *= 0.98;
  },
  draw(ctx, p) {
    const alpha = p.opacity;
    if (alpha < 0.05) return;

    const hue = p.hue ?? 0;
    const color = `hsl(${hue}, 100%, 75%)`;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);

    // diamond/glitter shape
    const size = p.size * (p.z ?? 1);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.6, 0);
    ctx.closePath();
    ctx.fill();

    // white highlight
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(-size * 0.2, -size * 0.2, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },
};

// hearts - floating hearts with gentle bob and glow
const hearts: ParticleConfig = {
  count: 30,
  spawnArea: { x: 0.1, y: 0.8, width: 0.8, height: 0.2 },
  gravity: -25,
  colors: ["#ff3366", "#ff6699", "#ff4477", "#ff5588", "#ff2255", "#ff77aa"],
  sizeRange: [8, 16],
  speedRange: [15, 35],
  lifetimeRange: [2, 4],
  fadeIn: 0.2,
  fadeOut: 0.4,
  init(p, _i, config) {
    p.vx = rand(-15, 15);
    p.vy = -rand(config.speedRange[0], config.speedRange[1]);
    p.phase = rand(0, Math.PI * 2);
    p.scale = rand(0.6, 1.3);
  },
  update(p, dt) {
    // gentle sway
    p.vx += Math.sin(p.life * 2 + (p.phase ?? 0)) * 20 * dt;
    p.vx *= 0.98;

    // pulsing scale (heartbeat)
    const beat = Math.sin(p.life * 6 + (p.phase ?? 0));
    p.scale = 0.8 + 0.3 * Math.max(0, beat);
  },
  draw(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.scale ?? 1, p.scale ?? 1);
    ctx.globalAlpha = p.opacity;

    // glow
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
    glowGradient.addColorStop(0, hexToRgba(p.color, 0.4));
    glowGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
    ctx.fill();

    // heart shape
    const s = p.size * 0.6;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(-s * 1.5, s * 0.3, -s * 1.5, -s * 0.8, 0, -s * 0.3);
    ctx.bezierCurveTo(s * 1.5, -s * 0.8, s * 1.5, s * 0.3, 0, s);
    ctx.fill();

    // highlight
    ctx.fillStyle = hexToRgba("#ffffff", 0.4);
    ctx.beginPath();
    ctx.arc(-s * 0.4, -s * 0.1, s * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },
};

// vortex - particles spiraling into center with increasing speed
const vortex: ParticleConfig = {
  count: 80,
  spawnArea: { x: 0, y: 0, width: 1, height: 1 },
  gravity: 0,
  colors: ["#8800ff", "#aa44ff", "#cc66ff", "#6600cc", "#9922ff", "#bb55ff"],
  sizeRange: [2, 5],
  speedRange: [10, 30],
  lifetimeRange: [1.5, 3],
  fadeIn: 0.1,
  fadeOut: 0.2,
  init(p) {
    // start from edge, spiral toward center
    const angle = rand(0, Math.PI * 2);
    const radius = rand(50, 80);
    p.x = 50 + Math.cos(angle) * radius;
    p.y = 50 + Math.sin(angle) * radius;
    p.phase = angle; // initial angle
    p.z = radius; // current radius
    p.scale = rand(0.5, 1.5);
    p.trail = [];
  },
  update(p, dt) {
    // spiral inward
    p.z = Math.max(0, (p.z ?? 50) - 15 * dt);
    p.phase = ((p.phase ?? 0) + 3 * dt) % (Math.PI * 2);

    // acceleration as it gets closer
    const speedMult = 1 + (1 - (p.z ?? 0) / 80) * 2;

    const targetX = 50 + Math.cos(p.phase ?? 0) * (p.z ?? 0);
    const targetY = 50 + Math.sin(p.phase ?? 0) * (p.z ?? 0);

    // store trail
    if (p.trail) {
      p.trail.unshift({ x: p.x, y: p.y, opacity: p.opacity });
      if (p.trail.length > 8) p.trail.pop();
    }

    p.vx = (targetX - p.x) * speedMult * 5;
    p.vy = (targetY - p.y) * speedMult * 5;
    p.x = targetX;
    p.y = targetY;

    // shrink as approaching center
    p.scale = 0.3 + ((p.z ?? 0) / 80) * 1.2;
  },
  draw(ctx, p) {
    // draw trail
    if (p.trail && p.trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 1; i < p.trail.length; i++) {
        const t = p.trail[i];
        const prev = p.trail[i - 1];
        const trailOpacity = p.opacity * (1 - i / p.trail.length) * 0.5;
        ctx.strokeStyle = hexToRgba(p.color, trailOpacity);
        ctx.lineWidth = p.size * (p.scale ?? 1) * (1 - i / p.trail.length);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // particle core
    const size = p.size * (p.scale ?? 1);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

// cosmos - galaxies with swirling nebula clouds
const cosmos: ParticleConfig = {
  count: 100,
  spawnArea: { x: 0, y: 0, width: 1, height: 1 },
  gravity: 0,
  colors: [
    "#4400aa",
    "#6622cc",
    "#8844ee",
    "#2200ff",
    "#aa66ff",
    "#ff44aa",
    "#ff88cc",
  ],
  sizeRange: [3, 12],
  speedRange: [1, 4],
  lifetimeRange: [3, 6],
  fadeIn: 0.3,
  fadeOut: 0.4,
  init(p) {
    p.phase = rand(0, Math.PI * 2);
    p.z = rand(0.3, 1); // depth
    p.scale = rand(0.5, 2) * (p.z ?? 1);
    p.hue = rand(200, 320); // purple-pink range

    // spiral positioning
    const arm = Math.floor(rand(0, 3));
    const armAngle = (arm * Math.PI * 2) / 3 + rand(-0.3, 0.3);
    const radius = rand(5, 45);
    p.x = 50 + Math.cos(armAngle + radius * 0.05) * radius;
    p.y = 50 + Math.sin(armAngle + radius * 0.05) * radius;
    p.targetX = armAngle;
    p.targetY = radius;
  },
  update(p, dt) {
    // slow galactic rotation
    p.targetX = ((p.targetX ?? 0) + 0.3 * dt) % (Math.PI * 2);
    const radius = p.targetY ?? 20;

    p.x = 50 + Math.cos((p.targetX ?? 0) + radius * 0.05) * radius;
    p.y = 50 + Math.sin((p.targetX ?? 0) + radius * 0.05) * radius;

    // add some wobble
    p.x += Math.sin(p.life * 0.5 + (p.phase ?? 0)) * 2;
    p.y += Math.cos(p.life * 0.7 + (p.phase ?? 0)) * 2;

    // color shift
    p.hue = ((p.hue ?? 260) + 10 * dt) % 360;
    if (p.hue < 200 || p.hue > 320) p.hue = 200;

    // twinkle
    p.baseOpacity = 0.4 + 0.6 * Math.abs(Math.sin(p.life * 2 + (p.phase ?? 0)));
  },
  draw(ctx, p) {
    const size = p.size * (p.scale ?? 1);
    const hue = p.hue ?? 260;
    const color = `hsl(${hue}, 80%, 65%)`;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // nebula cloud
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
    gradient.addColorStop(0, hexToRgba(color, p.opacity * 0.6));
    gradient.addColorStop(0.3, hexToRgba(color, p.opacity * 0.3));
    gradient.addColorStop(0.7, hexToRgba(color, p.opacity * 0.1));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
    ctx.fill();

    // star core
    if ((p.z ?? 1) > 0.6) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = p.opacity * (p.z ?? 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },
};

export const PARTICLE_PRESETS: Record<string, ParticleConfig> = {
  embers,
  confetti,
  sparkle,
  snow,
  fireflies,
  smoke,
  aurora,
  petals,
  stardust,
  plasma,
  electric,
  glitter,
  hearts,
  vortex,
  cosmos,
};

// --- particle system ---

export class ParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: ParticleConfig;
  private particles: Particle[] = [];
  private duration: number;
  private onComplete?: () => void;
  private animFrameId: number | null = null;
  private lastTime: number = 0;
  private elapsed: number = 0;
  private spawnIndex: number = 0;
  private spawnInterval: number;
  private spawnTimer: number = 0;
  private running: boolean = false;

  private logicalWidth: number;
  private logicalHeight: number;
  private offsetX: number;
  private offsetY: number;

  constructor(
    canvas: HTMLCanvasElement,
    presetName: string,
    duration: number,
    onComplete?: () => void,
    logicalWidth?: number,
    logicalHeight?: number,
    cssWidth?: number,
    cssHeight?: number,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("failed to get 2d context");
    this.ctx = ctx;

    const preset = PARTICLE_PRESETS[presetName];
    if (!preset) throw new Error(`unknown particle preset: ${presetName}`);
    this.config = preset;

    this.duration = duration;
    this.onComplete = onComplete;

    this.logicalWidth = logicalWidth ?? canvas.width;
    this.logicalHeight = logicalHeight ?? canvas.height;

    const cw = cssWidth ?? canvas.width;
    const ch = cssHeight ?? canvas.height;

    this.offsetX = (cw - this.logicalWidth) / 2;
    this.offsetY = (ch - this.logicalHeight) / 2;

    // stagger spawning over the first 30% of duration, but at least 200ms
    const spawnWindow = Math.max(0.2, duration * 0.3);
    this.spawnInterval = spawnWindow / this.config.count;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.elapsed = 0;
    this.spawnIndex = 0;
    this.spawnTimer = 0;
    this.particles = [];
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.particles = [];
  }

  // smoothly finish by stopping emissions but letting existing particles die out
  finish(): void {
    this.duration = 0;
    this.spawnIndex = this.config.count;
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // cap delta to prevent huge jumps after tab switch
    if (dt > 0.05) dt = 0.05;

    this.elapsed += dt;
    this.spawnTimer += dt;

    // spawn particles in a staggered fashion
    while (
      this.spawnIndex < this.config.count &&
      this.spawnTimer >= this.spawnInterval
    ) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnParticle(this.spawnIndex);
      this.spawnIndex++;
    }

    // update all particles
    this.updateParticles(dt);

    // render
    this.render();

    // check if we should stop
    if (this.elapsed >= this.duration && this.particles.length === 0) {
      this.stop();
      this.onComplete?.();
      return;
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private spawnParticle(index: number): void {
    const c = this.config;
    const w = this.logicalWidth;
    const h = this.logicalHeight;

    const p: Particle = {
      x: this.offsetX + (c.spawnArea.x + Math.random() * c.spawnArea.width) * w,
      y:
        this.offsetY + (c.spawnArea.y + Math.random() * c.spawnArea.height) * h,
      vx: 0,
      vy: 0,
      size: rand(c.sizeRange[0], c.sizeRange[1]),
      color: pick(c.colors),
      opacity: 1,
      baseOpacity: 1,
      life: 0,
      maxLife: rand(c.lifetimeRange[0], c.lifetimeRange[1]),
      rotation: rand(0, 360),
      rotationSpeed: rand(-60, 60),
    };

    // let preset customize initial state
    c.init?.(p, index, c);

    this.particles.push(p);
  }

  private updateParticles(dt: number): void {
    const c = this.config;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.life += dt;

      // remove dead particles
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // apply gravity
      p.vy += c.gravity * dt;

      // custom per-preset update
      c.update?.(p, dt);

      // integrate position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;

      // compute display opacity from fade in/out
      p.opacity = computeOpacity(p, c.fadeIn, c.fadeOut);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    for (const p of this.particles) {
      if (p.opacity <= 0) continue;

      if (this.config.draw) {
        this.config.draw(ctx, p);
      } else {
        // default draw: simple circle
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}
