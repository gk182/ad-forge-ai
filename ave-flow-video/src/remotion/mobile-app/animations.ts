/**
 * Remotion animation utilities for the Mobile App Video Generator.
 * All animations are driven by useCurrentFrame() + spring() / interpolate()
 * to ensure frame-accurate rendering in headless Chrome.
 *
 * NO Framer Motion. NO CSS @keyframes.
 */
import { spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// ─── Spring Scale ────────────────────────────────────────────────────────────
/**
 * Returns a scale value animated via Remotion spring.
 * Use for elements that should "pop" in from 0 → 1.
 */
export function useSpringScale(options?: {
  delay?: number;
  from?: number;
  to?: number;
  damping?: number;
  mass?: number;
  stiffness?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const {
    delay = 0,
    from = 0,
    to = 1,
    damping = 12,
    mass = 0.5,
    stiffness = 120,
  } = options || {};

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping, mass, stiffness },
  });

  return interpolate(progress, [0, 1], [from, to]);
}

// ─── Stagger In ──────────────────────────────────────────────────────────────
/**
 * Returns opacity and translateY for a staggered entrance animation.
 * Each item in a list can use `index` to offset its appearance.
 */
export function useStaggerIn(
  index: number,
  options?: {
    staggerDelay?: number;
    baseDelay?: number;
    distance?: number;
  }
) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const {
    staggerDelay = 5,
    baseDelay = 0,
    distance = 40,
  } = options || {};

  const delay = baseDelay + index * staggerDelay;

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 100 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [distance, 0]);

  return { opacity, translateY };
}

// ─── Highlight Pulse ─────────────────────────────────────────────────────────
/**
 * Returns scale + opacity values for a "pulsing highlight" effect.
 * Use for CTA buttons or feature callout badges.
 * The pulse loops continuously driven by frame count, not CSS animation.
 */
export function useHighlightPulse(options?: {
  delay?: number;
  minScale?: number;
  maxScale?: number;
  cycleDurationFrames?: number;
}) {
  const frame = useCurrentFrame();
  const {
    delay = 0,
    minScale = 1.0,
    maxScale = 1.08,
    cycleDurationFrames = 30,
  } = options || {};

  const adjustedFrame = Math.max(0, frame - delay);
  const cyclePosition = adjustedFrame % cycleDurationFrames;
  const halfCycle = cycleDurationFrames / 2;

  const scale =
    cyclePosition < halfCycle
      ? interpolate(cyclePosition, [0, halfCycle], [minScale, maxScale], {
          extrapolateRight: 'clamp',
        })
      : interpolate(
          cyclePosition,
          [halfCycle, cycleDurationFrames],
          [maxScale, minScale],
          { extrapolateRight: 'clamp' }
        );

  // Glow opacity follows the same rhythm
  const glowOpacity = interpolate(scale, [minScale, maxScale], [0.3, 0.8]);

  return { scale, glowOpacity };
}

// ─── Fade In ─────────────────────────────────────────────────────────────────
/**
 * Simple opacity fade driven by frame interpolation.
 */
export function useFadeIn(options?: {
  delay?: number;
  durationFrames?: number;
}) {
  const frame = useCurrentFrame();
  const { delay = 0, durationFrames = 15 } = options || {};

  const adjustedFrame = Math.max(0, frame - delay);
  return interpolate(adjustedFrame, [0, durationFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });
}

// ─── Slide Up ────────────────────────────────────────────────────────────────
/**
 * Returns translateY + opacity for a slide-up entrance.
 */
export function useSlideUp(options?: {
  delay?: number;
  distance?: number;
  durationFrames?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { delay = 0, distance = 60 } = options || {};

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, mass: 0.5, stiffness: 100 },
  });

  const translateY = interpolate(progress, [0, 1], [distance, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return { translateY, opacity };
}

// ─── 3D Rotation ─────────────────────────────────────────────────────────────
/**
 * Returns rotateY value animated from startAngle → 0 via spring.
 * Used for phone mockup 3D entry effect.
 */
export function use3DRotation(options?: {
  delay?: number;
  startAngle?: number;
  damping?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { delay = 0, startAngle = 25, damping = 14 } = options || {};

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping, mass: 0.8, stiffness: 80 },
  });

  const rotateY = interpolate(progress, [0, 1], [startAngle, 0]);
  return rotateY;
}
