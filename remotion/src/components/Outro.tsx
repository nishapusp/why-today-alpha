import React from "react";
import { Img } from "remotion";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface OutroProps {
  tagline: string;
  ctaLabel: string;
  theme: VisualTheme;
  qrDataUri?: string;
}

export default function Outro({ tagline, ctaLabel, theme, qrDataUri }: OutroProps) {
  const style = useEntranceStyle("fade");
  return (
    <div style={{ ...style, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <p style={{ fontFamily: "Georgia, serif", fontSize: 52, fontWeight: 700, color: theme.text, marginBottom: 40, lineHeight: 1.3 }}>{tagline}</p>
      <div style={{ borderRadius: 999, padding: "24px 56px", background: theme.positive, color: "#fff", fontSize: 34, fontWeight: 700, marginBottom: 48 }}>
        {ctaLabel}
      </div>
      {qrDataUri && <Img src={qrDataUri} width={220} height={220} style={{ borderRadius: 16, marginBottom: 24 }} />}
      <p style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 34, color: theme.accent, marginTop: 24 }}>whytoday.in</p>
    </div>
  );
}
