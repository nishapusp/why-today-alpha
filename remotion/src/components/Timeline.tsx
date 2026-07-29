import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface TimelineItem {
  date: string;
  event: string;
  detail?: string;
}

export interface TimelineProps {
  items: TimelineItem[];
  theme: VisualTheme;
}

function Row({ item, index, isLast, theme }: { item: TimelineItem; index: number; isLast: boolean; theme: VisualTheme }) {
  const style = useEntranceStyle("slide-left", index * 8);
  const color = theme.accentRotation[index % theme.accentRotation.length];
  return (
    <div style={{ ...style, position: "relative", paddingLeft: 48 }}>
      <span
        style={{
          position: "absolute",
          left: isLast ? -8 : -4,
          top: 6,
          width: isLast ? 32 : 20,
          height: isLast ? 32 : 20,
          borderRadius: "50%",
          background: color,
          border: `4px solid ${theme.background}`,
        }}
      />
      <p style={{ fontSize: 26, fontWeight: 600, color: theme.textMuted, margin: 0, textTransform: "uppercase" }}>{item.date}</p>
      <p style={{ fontFamily: "Georgia, serif", fontSize: 40, fontWeight: 700, color, margin: "4px 0 0" }}>{item.event}</p>
      {item.detail && <p style={{ fontSize: 26, color: theme.textMuted, marginTop: 4 }}>{item.detail}</p>}
    </div>
  );
}

export default function Timeline({ items, theme }: TimelineProps) {
  if (!items?.length) return null;
  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 20, top: 4, bottom: 4, width: 2, background: theme.border }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        {items.map((item, i) => (
          <Row key={`${item.date}-${i}`} item={item} index={i} isLast={i === items.length - 1} theme={theme} />
        ))}
      </div>
    </div>
  );
}
