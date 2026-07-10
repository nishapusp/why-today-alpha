import { TimeMachine as TimeMachineData } from "@/lib/types";
import { CategoryStyle } from "@/lib/categoryStyle";

/**
 * Time Machine — the six-step temporal spine of a story.
 *
 * Reads top-to-bottom like time travel toward today: the long view first,
 * accelerating into TODAY (the emphasized node), then one dashed step into
 * the future. The spine + node structure is meaningful, not decorative —
 * this content genuinely IS a sequence.
 *
 * Server component: no interactivity, renders nothing if data is absent
 * (older stories) so archive pages stay clean.
 */

const STEPS: { key: keyof TimeMachineData; label: string }[] = [
  { key: "tenYearsAgo", label: "10 years ago" },
  { key: "lastYear", label: "Last year" },
  { key: "lastMonth", label: "Last month" },
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "future", label: "What happens next?" },
];

export default function TimeMachine({
  data,
  cat,
}: {
  data?: TimeMachineData;
  cat: CategoryStyle;
}) {
  if (!data) return null;
  const steps = STEPS.filter((s) => (data[s.key] || "").trim());
  if (steps.length < 3) return null; // too sparse to feel like a timeline

  return (
    <section
      aria-label="Time Machine: how this story evolved over time"
      className="rounded-2xl border border-[var(--border)] p-5 mb-8 overflow-hidden"
      style={{ background: cat.tint }}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <p className="text-xs font-mono uppercase tracking-wide" style={{ color: cat.deep }}>
          ⏳ Time Machine
        </p>
      </div>
      <p className="text-[13px] mb-5" style={{ color: cat.deep, opacity: 0.75 }}>
        How today&rsquo;s news fits into the bigger picture
      </p>

      <ol className="relative m-0 p-0 list-none">
        {steps.map((step, i) => {
          const isToday = step.key === "today";
          const isFuture = step.key === "future";
          const isLast = i === steps.length - 1;
          return (
            <li key={step.key} className="relative pl-7 pb-5 last:pb-0">
              {/* connector to the next node — dashed once time turns speculative */}
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[7px] top-4 bottom-0 w-0"
                  style={{
                    borderLeft: isToday
                      ? `2px dashed ${cat.accent}`
                      : `2px solid ${cat.accent}55`,
                  }}
                />
              )}
              {/* node */}
              <span
                aria-hidden
                className="absolute left-0 top-[3px] rounded-full"
                style={
                  isToday
                    ? {
                        width: "16px",
                        height: "16px",
                        background: cat.accent,
                        boxShadow: `0 0 0 4px ${cat.accent}33`,
                      }
                    : isFuture
                      ? {
                          width: "12px",
                          height: "12px",
                          left: "2px",
                          background: "transparent",
                          border: `2px dashed ${cat.accent}`,
                        }
                      : {
                          width: "10px",
                          height: "10px",
                          left: "3px",
                          background: `${cat.accent}`,
                          opacity: 0.55,
                        }
                }
              />
              <p
                className={`font-mono uppercase tracking-wide mb-1 ${isToday ? "text-xs font-semibold" : "text-[11px]"}`}
                style={{ color: isToday ? cat.accent : cat.deep, opacity: isToday ? 1 : 0.8 }}
              >
                {step.label}
              </p>
              <p
                className={`leading-relaxed break-words ${isToday ? "text-[15px] font-medium text-[var(--text-primary)]" : "text-sm text-[var(--text-primary)]"}`}
                style={isFuture ? { opacity: 0.85, fontStyle: "italic" } : undefined}
              >
                {data[step.key]}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
