import type { Component } from "solid-js";
import { createSignal, Show, For, onCleanup } from "solid-js";
import { Shield, Check } from "lucide-solid";
import Button from "../common/Button";
import type { ChallengeExport } from "../../lib/types";

interface HumanVerificationProps {
  onVerified: (data: ChallengeExport) => void;
}

// -- data structures for mouse tracking and analysis --

interface TargetCircle {
  id: number;
  x: number;
  y: number;
}

interface MouseSample {
  x: number;
  y: number;
  t: number;
}

interface SegmentData {
  fromTarget: number;
  toTarget: number;
  samples: MouseSample[];
  clickTime: number;
  startTime: number;
}

interface ChallengeData {
  segments: SegmentData[];
  totalStartTime: number;
  totalEndTime: number;
}

type Phase = "ready" | "active" | "analyzing" | "passed" | "failed";

// -- constants --

const CONTAINER_WIDTH = 600;
const CONTAINER_HEIGHT = 400;
const CIRCLE_RADIUS = 24;
const MIN_DISTANCE = 120;
const PADDING = 48;
const TARGET_COUNT = 5;
const HUMAN_THRESHOLD = 0.35;

// -- circle positioning --

function generateCirclePositions(
  width: number,
  height: number,
): TargetCircle[] {
  const circles: TargetCircle[] = [];
  const maxAttempts = 200;

  for (let id = 1; id <= TARGET_COUNT; id++) {
    let placed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = PADDING + Math.random() * (width - 2 * PADDING);
      const y = PADDING + Math.random() * (height - 2 * PADDING);

      const tooClose = circles.some((c) => {
        const dx = c.x - x;
        const dy = c.y - y;
        return Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE;
      });

      if (!tooClose) {
        circles.push({ id, x, y });
        placed = true;
        break;
      }
    }

    // fallback grid placement if rejection sampling exhausts attempts
    if (!placed) {
      const cols = 3;
      const row = Math.floor((id - 1) / cols);
      const col = (id - 1) % cols;
      circles.push({
        id,
        x: PADDING + col * ((width - 2 * PADDING) / (cols - 1)),
        y: PADDING + row * ((height - 2 * PADDING) / 1),
      });
    }
  }

  return circles;
}

// -- analysis functions --
// each returns a score from 0.0 (bot-like) to 1.0 (human-like)

function scoreTimingVariance(segments: SegmentData[]): number {
  if (segments.length < 2) return 0;

  const intervals = segments.map((s) => s.clickTime - s.startTime);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean === 0) return 0;

  const variance =
    intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean;

  // humans have natural variance in click timing
  // bots tend to be metronomic or instantaneous
  if (cv < 0.03) return 0;
  if (cv < 0.08) return 0.3;
  if (cv < 0.12) return 0.6;
  return 1.0;
}

function scorePathCurvature(segments: SegmentData[]): number {
  const ratios: number[] = [];

  for (const seg of segments) {
    if (seg.samples.length < 3) continue;

    const first = seg.samples[0];
    const last = seg.samples[seg.samples.length - 1];
    const straightDist = Math.sqrt(
      (last.x - first.x) ** 2 + (last.y - first.y) ** 2,
    );

    // skip very short movements where curvature is meaningless
    if (straightDist < 10) continue;

    let pathLength = 0;
    for (let i = 1; i < seg.samples.length; i++) {
      const dx = seg.samples[i].x - seg.samples[i - 1].x;
      const dy = seg.samples[i].y - seg.samples[i - 1].y;
      pathLength += Math.sqrt(dx * dx + dy * dy);
    }

    ratios.push(pathLength / straightDist);
  }

  if (ratios.length === 0) return 0;

  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  // humans never move in perfectly straight lines
  // motor control imprecision guarantees some curvature
  if (avgRatio < 1.02) return 0;
  if (avgRatio < 1.06) return 0.3;
  if (avgRatio < 1.1) return 0.6;
  if (avgRatio > 4.0) return 0.5;
  return 1.0;
}

function scoreSpeedVariance(segments: SegmentData[]): number {
  const allSpeedCVs: number[] = [];

  for (const seg of segments) {
    if (seg.samples.length < 5) continue;

    const speeds: number[] = [];
    for (let i = 1; i < seg.samples.length; i++) {
      const dx = seg.samples[i].x - seg.samples[i - 1].x;
      const dy = seg.samples[i].y - seg.samples[i - 1].y;
      const dt = seg.samples[i].t - seg.samples[i - 1].t;
      if (dt > 0) {
        speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
      }
    }

    if (speeds.length < 3) continue;

    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    if (mean === 0) continue;

    const variance =
      speeds.reduce((sum, v) => sum + (v - mean) ** 2, 0) / speeds.length;
    const cv = Math.sqrt(variance) / mean;
    allSpeedCVs.push(cv);
  }

  if (allSpeedCVs.length === 0) return 0;

  const avgCV = allSpeedCVs.reduce((a, b) => a + b, 0) / allSpeedCVs.length;

  // humans accelerate and decelerate naturally along paths
  // bots maintain constant velocity
  if (avgCV < 0.1) return 0;
  if (avgCV < 0.25) return 0.4;
  if (avgCV < 0.4) return 0.7;
  return 1.0;
}

function scoreApproachJitter(
  segments: SegmentData[],
  circles: TargetCircle[],
): number {
  const jitterScores: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const target = circles[i];
    if (seg.samples.length < 5) continue;

    // isolate the last stretch of movement approaching the target
    const approachSamples = seg.samples.filter((s) => {
      const dx = s.x - target.x;
      const dy = s.y - target.y;
      return Math.sqrt(dx * dx + dy * dy) < 60;
    });

    if (approachSamples.length < 4) continue;

    // count direction changes via cross product sign flips
    let directionChanges = 0;
    for (let j = 2; j < approachSamples.length; j++) {
      const dx1 = approachSamples[j - 1].x - approachSamples[j - 2].x;
      const dy1 = approachSamples[j - 1].y - approachSamples[j - 2].y;
      const dx2 = approachSamples[j].x - approachSamples[j - 1].x;
      const dy2 = approachSamples[j].y - approachSamples[j - 1].y;

      const cross = dx1 * dy2 - dy1 * dx2;
      if (j > 2) {
        const prevDx1 = approachSamples[j - 2].x - approachSamples[j - 3].x;
        const prevDy1 = approachSamples[j - 2].y - approachSamples[j - 3].y;
        const prevCross = prevDx1 * dy1 - prevDy1 * dx1;
        if (cross * prevCross < 0) directionChanges++;
      }
    }

    const jitterRatio =
      directionChanges / Math.max(approachSamples.length - 2, 1);
    jitterScores.push(jitterRatio);
  }

  // not enough data to judge, give a neutral score
  if (jitterScores.length === 0) return 0.5;

  const avgJitter =
    jitterScores.reduce((a, b) => a + b, 0) / jitterScores.length;

  // humans have micro-corrections from motor noise (fitts's law)
  // bots converge smoothly with zero directional jitter
  if (avgJitter < 0.01) return 0.2;
  if (avgJitter < 0.05) return 0.5;
  return 1.0;
}

function scoreOverallTiming(data: ChallengeData): number {
  const totalMs = data.totalEndTime - data.totalStartTime;
  const totalSec = totalMs / 1000;

  if (totalSec < 0.8) return 0;
  if (totalSec < 1.5) return 0.3;
  if (totalSec > 60) return 0.5;
  return 1.0;
}

function analyzeChallenge(
  data: ChallengeData,
  circles: TargetCircle[],
): { isHuman: boolean; score: number } {
  const timing = scoreTimingVariance(data.segments);
  const curvature = scorePathCurvature(data.segments);
  const speed = scoreSpeedVariance(data.segments);
  const jitter = scoreApproachJitter(data.segments, circles);
  const overall = scoreOverallTiming(data);

  const score =
    timing * 0.25 +
    curvature * 0.25 +
    speed * 0.2 +
    jitter * 0.2 +
    overall * 0.1;

  return {
    isHuman: score >= HUMAN_THRESHOLD,
    score,
  };
}

// -- component --

const HumanVerification: Component<HumanVerificationProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  const [phase, setPhase] = createSignal<Phase>("ready");
  const [circles, setCircles] = createSignal<TargetCircle[]>(
    generateCirclePositions(CONTAINER_WIDTH, CONTAINER_HEIGHT),
  );
  const [currentTarget, setCurrentTarget] = createSignal(1);
  const [completedCount, setCompletedCount] = createSignal(0);
  const [wrongClickId, setWrongClickId] = createSignal<number | null>(null);
  const [failureMessage, setFailureMessage] = createSignal("");

  // mutable tracking state, no reactivity needed
  let challengeData: ChallengeData = {
    segments: [],
    totalStartTime: 0,
    totalEndTime: 0,
  };
  let currentSegmentSamples: MouseSample[] = [];
  let currentSegmentStartTime = 0;
  let wrongClickTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (wrongClickTimeout) clearTimeout(wrongClickTimeout);
  });

  function handleStart() {
    const now = performance.now();
    challengeData = {
      segments: [],
      totalStartTime: now,
      totalEndTime: 0,
    };
    currentSegmentSamples = [];
    currentSegmentStartTime = now;
    setPhase("active");
  }

  function handleMouseMove(e: MouseEvent) {
    if (phase() !== "active") return;

    const rect = containerRef!.getBoundingClientRect();
    currentSegmentSamples.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
    });
  }

  function handleCircleClick(circleId: number, e: MouseEvent) {
    // prevent click events during non-active phases
    if (phase() !== "active") return;
    e.stopPropagation();

    if (circleId !== currentTarget()) {
      // wrong target feedback
      setWrongClickId(circleId);
      if (wrongClickTimeout) clearTimeout(wrongClickTimeout);
      wrongClickTimeout = setTimeout(() => setWrongClickId(null), 400);
      return;
    }

    // correct target hit
    const now = performance.now();
    const rect = containerRef!.getBoundingClientRect();

    challengeData.segments.push({
      fromTarget: circleId - 1,
      toTarget: circleId,
      samples: [...currentSegmentSamples],
      clickTime: now,
      startTime: currentSegmentStartTime,
    });

    // reset for next segment
    currentSegmentSamples = [
      { x: e.clientX - rect.left, y: e.clientY - rect.top, t: now },
    ];
    currentSegmentStartTime = now;

    const nextCount = completedCount() + 1;
    setCompletedCount(nextCount);

    if (nextCount >= TARGET_COUNT) {
      // all targets hit, begin analysis
      challengeData.totalEndTime = now;
      setPhase("analyzing");

      setTimeout(() => {
        const result = analyzeChallenge(challengeData, circles());
        if (result.isHuman) {
          setPhase("passed");
          // package raw challenge data for the backend to re-validate
          const exportData: ChallengeExport = {
            segments: challengeData.segments.map((s) => ({
              fromTarget: s.fromTarget,
              toTarget: s.toTarget,
              samples: s.samples.map((m) => ({ x: m.x, y: m.y, t: m.t })),
              clickTime: s.clickTime,
              startTime: s.startTime,
            })),
            circles: circles().map((c) => ({ id: c.id, x: c.x, y: c.y })),
            totalStartTime: challengeData.totalStartTime,
            totalEndTime: challengeData.totalEndTime,
          };
          setTimeout(() => props.onVerified(exportData), 600);
        } else {
          setFailureMessage(
            "verification failed. please try again.",
          );
          setPhase("failed");
        }
      }, 1500);
    } else {
      setCurrentTarget(circleId + 1);
    }
  }

  function handleRetry() {
    setCircles(generateCirclePositions(CONTAINER_WIDTH, CONTAINER_HEIGHT));
    setCurrentTarget(1);
    setCompletedCount(0);
    setWrongClickId(null);
    setFailureMessage("");
    challengeData = {
      segments: [],
      totalStartTime: 0,
      totalEndTime: 0,
    };
    currentSegmentSamples = [];
    currentSegmentStartTime = 0;
    setPhase("ready");
  }

  function circleClasses(circleId: number): string {
    const base =
      "absolute flex items-center justify-center rounded-full w-12 h-12 text-[16px] font-bold cursor-pointer transition-colors duration-200 select-none";

    if (wrongClickId() === circleId) {
      return `${base} border-2 border-error text-white bg-orange-muted animate-target-shake`;
    }

    if (circleId < currentTarget()) {
      // completed
      return `${base} border-2 border-white/10 text-white/15 animate-target-complete pointer-events-none`;
    }

    if (circleId === currentTarget()) {
      // active target
      return `${base} border-2 border-orange text-white bg-orange-muted animate-target-pulse`;
    }

    // pending
    return `${base} border-2 border-white/20 text-white/30`;
  }

  return (
    <div class="max-w-[680px] w-full mx-4 animate-fade-in">
      <div class="mb-8 px-10">
        <div class="flex items-center gap-3 mb-4">
          <Shield size={24} class="text-orange" />
          <h2 class="text-[32px] leading-[40px] font-bold text-white tracking-[-0.02em]">
            human verfication
          </h2>
        </div>
        <p>complete the action below to verify your humanity</p>
      </div>

      {/* challenge area */}
      <div
        ref={containerRef}
        class="relative border-2 border-white/10 bg-black mx-auto"
        style={{
          width: `${CONTAINER_WIDTH}px`,
          height: `${CONTAINER_HEIGHT}px`,
        }}
        onMouseMove={handleMouseMove}
      >
        {/* ready state overlay */}
        <Show when={phase() === "ready"}>
          <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80 backdrop-blur-sm">
            <p class="text-[14px] font-mono text-white/30 mb-6">
              click the circles in order from 1 to 5.
            </p>
            <Button variant="primary" onClick={handleStart}>
              begin
            </Button>
          </div>
        </Show>

        {/* target circles, visible during ready (dimmed behind overlay) and active */}
        <Show
          when={
            phase() !== "analyzing" &&
            phase() !== "passed" &&
            phase() !== "failed"
          }
        >
          <For each={circles()}>
            {(circle, index) => (
              <div
                class={circleClasses(circle.id)}
                style={{
                  left: `${circle.x - CIRCLE_RADIUS}px`,
                  top: `${circle.y - CIRCLE_RADIUS}px`,
                  "animation-delay":
                    phase() === "ready" ? `${index() * 80}ms` : undefined,
                }}
                onClick={(e) => handleCircleClick(circle.id, e)}
              >
                {circle.id}
              </div>
            )}
          </For>
        </Show>

        {/* analyzing overlay */}
        <Show when={phase() === "analyzing"}>
          <div class="absolute inset-0 flex items-center justify-center animate-fade-in">
            <p class="text-[16px] font-mono text-white/60">verifying...</p>
          </div>
        </Show>

        {/* passed overlay */}
        <Show when={phase() === "passed"}>
          <div class="absolute inset-0 flex flex-col items-center justify-center animate-scale-in">
            <div class="w-16 h-16 rounded-full border-2 border-success flex items-center justify-center mb-4">
              <Check size={32} class="text-success" />
            </div>
            <p class="text-[16px] font-mono text-success">verified</p>
          </div>
        </Show>
      </div>

      {/* progress indicator */}
      <Show when={phase() === "active"}>
        <p class="text-[14px] font-mono text-white/40 mt-4 text-center">
          {completedCount()} / {TARGET_COUNT}
        </p>
      </Show>

      {/* failure state */}
      <Show when={phase() === "failed"}>
        <div class="mt-6 text-center">
          <p class="text-[14px] text-error mb-4">{failureMessage()}</p>
          <Button variant="secondary" onClick={handleRetry}>
            try again
          </Button>
        </div>
      </Show>
    </div>
  );
};

export default HumanVerification;
