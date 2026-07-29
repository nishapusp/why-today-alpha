import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CSSProperties } from "react";
import type { MotionAnimation } from "../../../lib/visualEngine/types";

/**
 * Video equivalent of components/motion/Reveal.tsx — same animation
 * vocabulary (fade/slide-left/slide-right/zoom/...), but driven by
 * useCurrentFrame()'s deterministic frame-time instead of an
 * IntersectionObserver, since a rendered video has no scroll position.
 */
export function useEntranceStyle(animation: MotionAnimation, delayFrames = 0): CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delayFrames);
  const progress = spring({ frame: local, fps, config: { damping: 200 } });
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  let transform: string;
  switch (animation) {
    case "slide-left":
      transform = `translateX(${interpolate(progress, [0, 1], [50, 0])}px)`;
      break;
    case "slide-right":
      transform = `translateX(${interpolate(progress, [0, 1], [-50, 0])}px)`;
      break;
    case "zoom":
      transform = `scale(${interpolate(progress, [0, 1], [0.9, 1])})`;
      break;
    default:
      transform = `translateY(${interpolate(progress, [0, 1], [16, 0])}px)`;
  }

  return { opacity, transform };
}

/** 0-1 progress for a delayed entrance, for callers that need the raw number (e.g. count-up, draw-chart). */
export function useEntranceProgress(delayFrames = 0): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delayFrames);
  return spring({ frame: local, fps, config: { damping: 200 } });
}
