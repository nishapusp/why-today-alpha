import { Category } from "@/lib/types";
import { CATEGORY_ORDER, getCategoryStyle, categoryAnchor } from "@/lib/categoryStyle";

/**
 * "Explore by sector" pill row — jumps to that category's card further
 * down the same page rather than a separate route: today's lead story if
 * the category has one today (see TopStoriesBySector's per-card id), else
 * its archive row (see CategoryArchive's id="archive-<anchor>"). Avoids
 * needing a whole new /category/[name] route for what's really just
 * in-page navigation.
 */
export default function SectorNav({ categoriesToday }: { categoriesToday: Set<Category> }) {
  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--text-secondary)] mb-2.5">
        Explore by sector
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
        {CATEGORY_ORDER.map((category) => {
          const style = getCategoryStyle(category);
          const anchor = categoriesToday.has(category)
            ? categoryAnchor(category)
            : `archive-${categoryAnchor(category)}`;
          return (
            <a
              key={category}
              href={`#${anchor}`}
              className="flex-shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl px-3.5 py-2.5 border transition-transform active:scale-95"
              style={{ borderColor: "var(--border)", background: "var(--surface)", minWidth: 76 }}
            >
              <span className="text-lg leading-none">{style.icon}</span>
              <span className="text-[10px] font-medium text-center leading-tight text-[var(--text-primary)]">
                {category}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
