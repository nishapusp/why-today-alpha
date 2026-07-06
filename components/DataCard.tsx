import { KeyNumber } from "@/lib/types";

export default function DataCardGrid({ numbers }: { numbers: KeyNumber[] }) {
  if (!numbers?.length) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-6">
      {numbers.map((n) => (
        <div
          key={n.label}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <p className="font-mono text-xl font-semibold text-[var(--navy)]">
            {n.value}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{n.label}</p>
        </div>
      ))}
    </div>
  );
}
