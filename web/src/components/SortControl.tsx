import { ArrowDown, ArrowUp, CaseSensitive, Clock, HardDrive, Percent, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { useLang } from "../lib/i18n";

export type SortKey = "added" | "name" | "size" | "progress";
export type SortDir = "desc" | "asc";
export type Sort = { key: SortKey; dir: SortDir };

const KEYS: SortKey[] = ["added", "name", "size", "progress"];

// Below 360 px the words do not fit one row (measured in Russian): icons stand in.
const ICON: Record<SortKey, LucideIcon> = { added: Clock, name: CaseSensitive, size: HardDrive, progress: Percent };

// Text buttons with rules between; the active one is accent and carries its
// direction. Never wraps: a rule would end a line.
export function SortControl({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 flex-nowrap">
      <span className="swiss-eyebrow hidden lg:inline">{t.sortLabel}</span>
      {KEYS.map((key, i) => {
        const active = value.key === key;
        const Icon = ICON[key];
        return (
          <div key={key} className="flex items-center gap-3">
            {i > 0 && <span aria-hidden="true" className="h-3 w-px bg-[var(--color-rule)]" />}
            <button
              type="button"
              aria-label={t.sort[key]}
              onClick={() =>
                // A name starts from A; everything else from the largest.
                onChange({ key, dir: active ? (value.dir === "desc" ? "asc" : "desc") : key === "name" ? "asc" : "desc" })
              }
              className={cn(
                "flex items-center gap-1 rounded-[4px] cursor-pointer transition-colors duration-150",
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                active ? "text-[var(--color-accent)]" : "text-[var(--color-ink)] hover:text-[var(--color-accent)]",
              )}
            >
              <Icon aria-hidden="true" className="min-[360px]:hidden size-4 shrink-0" />
              <span className="hidden min-[360px]:inline">{t.sort[key]}</span>
              {active &&
                (value.dir === "desc" ? (
                  <ArrowDown aria-hidden="true" className="size-3 shrink-0" />
                ) : (
                  <ArrowUp aria-hidden="true" className="size-3 shrink-0" />
                ))}
            </button>
          </div>
        );
      })}
    </div>
  );
}
