"use client";

import { KeyNumber } from "@/lib/types";
import { useInView } from "@/components/motion/useInView";
import { useCountUpText } from "@/components/motion/StatisticCard";

/**
 * Above-the-fold "reels-era" stat card — the single most compelling
 * keyNumber (picked via lib/pickHeroNumber), shown big and bold right
 * under the summary so a reader gets the story's headline figure at a
 * glance, before scrolling into the full DataCardGrid further down.
 * Reuses the Visual Engine's count-up animation for the same
 * screenshot-worthy feel as the video/infographic side of the product.
 */
export default function HeroStat({
  number,
  tint,
  deep,
  accent,
}: {
  number: KeyNumber;
  tint?: string;
  deep?: string;
  accent?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const animatedValue = useCountUpText(number.value, inView);

  return (
    <div
      ref={ref}
      className={`rounded-2xl px-5 py-4 mb-6 transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ background: tint ?? "var(--surface)", borderLeft: `5px solid ${accent ?? deep}` }}
    >
      <p
        className="font-mono text-4xl md:text-5xl font-extrabold leading-none break-words"
        style={{ color: deep ?? "var(--navy)" }}
      >
        {animatedValue}
      </p>
      <p className="text-sm mt-2 font-medium text-[var(--text-secondary)]">{number.label}</p>
      {number.previousValue && (
        <p className="text-xs mt-2 flex items-center gap-1.5 flex-wrap" style={{ color: accent ?? deep }}>
          <span className="opacity-70">{number.previousLabel || "Previously"}: {number.previousValue}</span>
          <span>→</span>
          <span className="font-semibold">{number.value}</span>
        </p>
      )}
    </div>
  );
}
