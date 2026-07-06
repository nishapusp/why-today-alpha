import { KeyNumber } from "@/lib/types";

export default function DataCardGrid({
  numbers,
  tint,
  deep,
}: {
  numbers: KeyNumber[];
  tint?: string;
  deep?: string;
}) {
  if (!numbers?.length) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-6">
      {numbers.map((n) => (
        <div key={n.label} className="rounded-xl p-4" style={{ background: tint ?? "var(--surface)" }}>
          <p className="font-mono text-xl font-semibold" style={{ color: deep ?? "var(--navy)" }}>
            {n.value}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{n.label}</p>
        </div>
      ))}
    </div>
  );
}
