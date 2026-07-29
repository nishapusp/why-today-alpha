import { VisualTheme } from "@/lib/visualEngine/types";
import Reveal from "./Reveal";

export interface ProcessFlowProps {
  variant: "process" | "cause-effect";
  steps: string[];
  theme: VisualTheme;
}

/** Step Flow ("how X works") and Chain Diagram ("why markets fell") share this component, styled by `variant`. */
export default function ProcessFlow({ variant, steps, theme }: ProcessFlowProps) {
  if (!steps?.length) return null;
  const isChain = variant === "cause-effect";
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={`${step}-${i}`}>
          <Reveal animation="slide-left" delay={i * 150}>
            <div
              className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
            >
              <span
                className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-mono font-bold"
                style={{ background: isChain ? `${theme.negative}22` : `${theme.accent}22`, color: isChain ? theme.negative : theme.accent }}
              >
                {i + 1}
              </span>
              <p className="text-sm leading-snug" style={{ color: theme.text }}>
                {step}
              </p>
            </div>
          </Reveal>
          {i < steps.length - 1 && (
            <div className="pl-[15px] py-1 text-sm" style={{ color: theme.textMuted }}>
              {isChain ? "leads to ↓" : "↓"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
