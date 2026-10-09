import { ArrowDown, ArrowUp, Pause, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { useLang } from "../lib/i18n";

export type Filter = "all" | "downloading" | "seeding" | "paused";

const FILTERS: Filter[] = ["all", "downloading", "seeding", "paused"];

// Below sm the three states are icons: their words do not fit one row.
const ICON: Partial<Record<Filter, LucideIcon>> = { downloading: ArrowDown, seeding: ArrowUp, paused: Pause };

// Text buttons, each with how many torrents it holds; the picked one is accent.
export function StatusFilter({
  value,
  counts,
  onChange,
}: {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (filter: Filter) => void;
}) {
  const { t, locale } = useLang();
  return (
    <div role="radiogroup" className="flex items-center gap-3 flex-nowrap min-w-0">
      {FILTERS.map((filter, i) => {
        const Icon = ICON[filter];
        return (
        <div key={filter} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden="true" className="h-3 w-px bg-[var(--color-rule)]" />}
          <button
            type="button"
            role="radio"
            aria-checked={value === filter}
            aria-label={t.filter[filter]}
            onClick={() => onChange(filter)}
            className={cn(
              "flex items-center gap-1.5 rounded-[4px] cursor-pointer whitespace-nowrap transition-colors duration-150",
              "text-[11px] font-semibold uppercase tracking-[0.08em]",
              value === filter ? "text-[var(--color-accent)]" : "text-[var(--color-ink)] hover:text-[var(--color-accent)]",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="sm:hidden size-3.5 shrink-0" strokeWidth={2.25} />}
            <span className={cn(Icon && "hidden sm:inline")}>{t.filter[filter]}</span>
            <span className="tabular-nums font-medium text-[var(--color-ink-muted)]">
              {counts[filter].toLocaleString(locale)}
            </span>
          </button>
        </div>
        );
      })}
    </div>
  );
}
