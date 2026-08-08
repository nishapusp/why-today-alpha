import Link from "next/link";
import { Category } from "@/lib/types";
import { CategoryHighlight } from "@/lib/getData";
import { CATEGORY_STYLE, CATEGORY_ORDER, categoryAnchor } from "@/lib/categoryStyle";

export default function CategoryArchive({
  byCategory,
}: {
  byCategory: Partial<Record<Category, CategoryHighlight[]>>;
}) {
  const categories = CATEGORY_ORDER.filter((c) => (byCategory[c]?.length ?? 0) > 0);
  if (categories.length === 0) return null;

  return (
    <div id="browse-by-category">
      <h2 className="font-display text-lg text-[var(--text-primary)] mb-3">Browse by category</h2>
      {/* 2026-08-08: was a full vertical stack per category (up to 4 full-
          width cards each) — with 12 categories that made this section
          alone taller than the rest of the page combined. Same horizontal-
          scroll-row pattern as Top stories by sector now, so this section's
          height is roughly constant regardless of how many categories
          exist, not multiplying with every category added. */}
      <div className="space-y-3.5">
        {categories.map((category) => {
          const stories = byCategory[category]!;
          const style = CATEGORY_STYLE[category];
          return (
            <div key={category} id={`archive-${categoryAnchor(category)}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[13px]">{style.icon}</span>
                <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: style.deep }}>
                  {category}
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
                {stories.map((story) => (
                  <Link
                    key={story.slug}
                    href={`/archive/${story.date}/${story.slug}`}
                    className="flex-shrink-0 rounded-xl border p-3 transition-colors hover:border-[var(--navy)]"
                    style={{ borderColor: "var(--border)", background: "var(--surface)", width: 168 }}
                  >
                    <p className="text-[13px] font-medium leading-snug line-clamp-3" style={{ color: "var(--text-primary)" }}>
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
