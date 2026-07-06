"use client";

const COPILOT_STUDIO_IFRAME_SRC =
  "https://copilotstudio.microsoft.com/environments/Default-3459a843-4947-4998-9c9b-75ca8717f4d1/bots/cr2e2_whytodaystudio1.0_vmcBlz/canvas?__version__=2&enableFileAttachment=false&cliAgent=true";

export default function AskWhyTodayAI() {
  return (
    <div className="rounded-2xl border border-[var(--soft-blue)]/30 bg-[var(--soft-blue)]/[0.05] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--soft-blue)]/20">
        <span className="text-lg">💬</span>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Ask Why Today AI
        </p>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-wide text-[var(--soft-blue)] border border-[var(--soft-blue)]/40 rounded-full px-2 py-0.5">
          Beta
        </span>
      </div>
      <iframe
        src={COPILOT_STUDIO_IFRAME_SRC}
        title="Why Today AI Assistant"
        className="w-full h-[420px] border-0"
      />
    </div>
  );
}