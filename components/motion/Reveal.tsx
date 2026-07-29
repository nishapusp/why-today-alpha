"use client";

import { CSSProperties, ReactNode } from "react";
import { MotionAnimation } from "@/lib/visualEngine/types";
import { useInView } from "./useInView";

const HIDDEN_CLASS: Record<MotionAnimation, string> = {
  fade: "opacity-0 translate-y-2",
  "slide-left": "opacity-0 translate-x-10",
  "slide-right": "opacity-0 -translate-x-10",
  "count-up": "opacity-0 translate-y-2",
  "draw-chart": "opacity-0",
  "grow-bar": "opacity-0",
  zoom: "opacity-0 scale-90",
  highlight: "opacity-0",
};

/**
 * Generic entrance wrapper used by every components/motion/* component —
 * CSS-transition based (no framer-motion dependency, matching the
 * dependency-free approach StoryChart.tsx already takes for its own bars).
 */
export default function Reveal({
  animation,
  delay = 0,
  className = "",
  as: Tag = "div",
  children,
}: {
  animation: MotionAnimation;
  delay?: number; // ms
  className?: string;
  as?: "div" | "li";
  children: ReactNode;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const style: CSSProperties = { transitionDelay: `${delay}ms` };

  return (
    <Tag
      ref={ref as never}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:scale-100 ${
        inView ? "opacity-100 translate-x-0 translate-y-0 scale-100" : HIDDEN_CLASS[animation]
      } ${className}`}
      style={style}
    >
      {children}
    </Tag>
  );
}
