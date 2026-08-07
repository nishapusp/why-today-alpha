import Link from "next/link";
import { Category } from "@/lib/types";
import { CategoryHighlight } from "@/lib/getData";
import { CATEGORY_STYLE } from "@/lib/categoryStyle";

// Fixed order so the section reads the same way every day, rather than
// shuffling with whatever order Object.keys happened to return.
const CATEGORY_ORDER: Category[] = [
  "Banking",
  "Economy",
  "Technology",
  "AI",
  "World",
  "Policy",
  "Corporate",
  "IPO",
  "Startups",
];

export default function CategoryArchive({
  byCategory,
}: {
  byCategory: Partial<Record<Category, CategoryHighlight[]>>;
}) {
  const categories = CATEGORY_ORDER.filter((c) => (byCategory[c]?.length ?? 0) > 0);
  if (categories.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-lg text-[var(--text-primary)] mb-3">Browse by category</h2>
      <div className="space-y-4">
        {categories.map((category) => {
          const stories = byCategory[category]!;
          const style = CATEGORY_STYLE[category];
          return (
            <div key={category}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[13px]">{style.icon}</span>
                <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: style.deep }}>
                  {category}
                </p>
              </div>
              <div className="space-y-1.5">
                {stories.map((story) => (
                  <Link
                    key={story.slug}
                    href={`/archive/${story.date}/${story.slug}`}
                    className="block rounded-xl border p-3 transition-colors hover:border-[var(--navy)]"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    <p className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                      {story.headline}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
