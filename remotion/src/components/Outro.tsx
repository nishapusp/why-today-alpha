import React from "react";
import { Img, useVideoConfig } from "remotion";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface OutroProps {
  tagline: string;
  ctaLabel: string;
  theme: VisualTheme;
  qrDataUri?: string;
}

// Staggered reveal (tagline -> CTA -> QR -> brand) reads as more deliberate
// and premium than one blanket fade for the whole slide — this is also now
// the true final slide (the "Keep Reading" WatchNext slide was dropped
// from video exports entirely, see render.ts), so it carries more weight.
export default function Outro({ tagline, ctaLabel, theme, qrDataUri }: OutroProps) {
  const { fps } = useVideoConfig();
  const stagger = (n: number) => Math.round(n * 0.28 * fps);
  const taglineStyle = useEntranceStyle("fade", stagger(0));
  const ctaStyle = useEntranceStyle("zoom", stagger(1));
  const qrStyle = useEntranceStyle("zoom", stagger(2));
  const brandStyle = useEntranceStyle("fade", stagger(3));

  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      {/* Soft radial glow behind the QR — a small touch that keeps the
          closing slide from reading as flat text-on-background like the
          rest of the video. */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 420,
          height: 420,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, ${theme.accent}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <p style={{ ...taglineStyle, fontFamily: "Georgia, serif", fontSize: 52, fontWeight: 700, color: theme.text, marginBottom: 40, lineHeight: 1.3, position: "relative" }}>
        {tagline}
      </p>
      <div
        style={{
          ...ctaStyle,
          borderRadius: 999,
          padding: "24px 56px",
          background: theme.positive,
          color: "#fff",
          fontSize: 34,
          fontWeight: 700,
          marginBottom: 48,
          position: "relative",
          boxShadow: `0 12px 32px ${theme.positive}55`,
        }}
      >
        {ctaLabel}
      </div>
      {qrDataUri && (
        <div style={{ ...qrStyle, position: "relative", padding: 16, borderRadius: 24, background: theme.surface, border: `2px solid ${theme.border}`, marginBottom: 24 }}>
          <Img src={qrDataUri} width={200} height={200} style={{ borderRadius: 12, display: "block" }} />
        </div>
      )}
      <p style={{ ...brandStyle, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 34, color: theme.accent, marginTop: 24, position: "relative" }}>
        whytoday.in
      </p>
    </div>
  );
}
