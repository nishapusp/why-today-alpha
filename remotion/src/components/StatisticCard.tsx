import React from "react";
import { interpolate } from "remotion";
import type { KeyNumber } from "../../../lib/types";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { parseLeadingNumber } from "../../../components/motion/parseNumber";
import { useEntranceProgress } from "../lib/entrance";

export interface StatisticCardProps extends KeyNumber {
  theme: VisualTheme;
  size?: "lg" | "sm";
  color?: string;
  delayFrames?: number;
}

export default function StatisticCard({
  value,
  label,
  trendNote,
  previousValue,
  previousLabel,
  theme,
  size = "lg",
  color,
  delayFrames = 0,
}: StatisticCardProps) {
  const progress = useEntranceProgress(delayFrames);
  const target = parseLeadingNumber(value);
  const displayValue =
    target === null
      ? value
      : value.replace(String(target), String(Math.round(interpolate(progress, [0, 1], [0, target]) * 10) / 10));

  return (
    <div
      style={{
        borderRadius: 28,
        padding: 40,
        background: theme.surface,
        border: `2px solid ${theme.border}`,
        opacity: interpolate(progress, [0, 1], [0, 1]),
      }}
    >
      <p
        style={{
          fontFamily: "Georgia, serif",
          fontWeight: 700,
          fontSize: size === "lg" ? 88 : 56,
          color: color ?? theme.accent,
          margin: 0,
        }}
      >
        {displayValue}
      </p>
      <p style={{ fontSize: 32, color: theme.text, marginTop: 12 }}>{label}</p>
      {previousValue && (
        <p style={{ fontSize: 26, color: theme.textMuted, marginTop: 8 }}>
          {previousLabel || "Previously"}: {previousValue}
        </p>
      )}
      {trendNote && <p style={{ fontSize: 26, color: theme.textMuted, marginTop: 12 }}>{trendNote}</p>}
    </div>
  );
}
