"use client";

import { useEffect, useState } from "react";
import { KeyNumber } from "@/lib/types";
import { MotionAnimation, VisualTheme } from "@/lib/visualEngine/types";
import { useInView, prefersReducedMotion } from "./useInView";
import { parseLeadingNumber } from "./parseNumber";

export interface StatisticCardProps extends KeyNumber {
  theme: VisualTheme;
  animation?: MotionAnimation;
  size?: "lg" | "sm";
}

/** ₹24 lakh crore -> animates "0 lakh crore" up to "24 lakh crore" on view. */
function useCountUpText(value: string, active: boolean) {
  const target = parseLeadingNumber(value);
  const shouldAnimate = active && target !== null && !prefersReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!shouldAnimate || target === null) return;
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const current = Math.round(target * progress * 10) / 10;
      setDisplay(value.replace(String(target), progress >= 1 ? String(target) : String(current)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shouldAnimate, value, target]);

  return shouldAnimate ? display : value;
}

export default function StatisticCard({
  value,
  label,
  trendNote,
  previousValue,
  previousLabel,
  theme,
  animation = "count-up",
  size = "lg",
}: StatisticCardProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const animatedValue = useCountUpText(value, inView && animation === "count-up");

  return (
    <div
      ref={ref}
      className={`rounded-2xl p-5 transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ background: theme.surface, border: `1px solid ${theme.accent}33` }}
    >
      <p
        className={`font-mono font-bold ${size === "lg" ? "text-4xl" : "text-2xl"}`}
        style={{ color: theme.accent }}
      >
        {animatedValue}
      </p>
      <p className="text-sm mt-1.5" style={{ color: theme.text }}>
        {label}
      </p>
      {previousValue && (
        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
          {previousLabel || "Previously"}: {previousValue}
        </p>
      )}
      {trendNote && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: theme.textMuted }}>
          {trendNote}
        </p>
      )}
    </div>
  );
}
