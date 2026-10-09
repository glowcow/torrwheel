import { Plus, Search, X } from "lucide-react";
import { cn } from "../lib/cn";
import { useLang } from "../lib/i18n";
import { SettingsMenu } from "./SettingsMenu";
import { Tooltip } from "./Tooltip";

type Props = {
  // App measures the header to place the sticky meta row under it.
  ref?: React.Ref<HTMLElement>;
  query: string;
  onQueryChange: (v: string) => void;
  onReset: () => void;
  onAdd: () => void;
};

// The wordmark, the name filter, then the add button and the gear. Never
// frosted: the meta row under it does that.
export function Header({ ref, query, onQueryChange, onReset, onAdd }: Props) {
  const { t } = useLang();

  return (
    <header ref={ref} className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-[var(--color-paper)]">
      <div
        className={cn(
          "mx-auto max-w-[1400px] swiss-rule",
          "pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]",
          "sm:pl-[max(2.5rem,env(safe-area-inset-left))] sm:pr-[max(2.5rem,env(safe-area-inset-right))]",
          "lg:pl-[max(4rem,env(safe-area-inset-left))] lg:pr-[max(4rem,env(safe-area-inset-right))]",
          // Two rows below sm (see --header-h): brand and controls, then the field.
          "h-[var(--header-h)] gap-x-3 gap-y-2 sm:gap-6 items-center content-center",
          // From lg the field is centred and gives way before the side columns do.
          "flex flex-wrap sm:flex-nowrap lg:grid lg:grid-cols-[1fr_minmax(0,42rem)_1fr]",
        )}
      >
        {/* The wordmark resets the page. */}
        <button
          type="button"
          onClick={onReset}
          className="order-1 sm:order-none shrink-0 select-none cursor-pointer rounded-md lg:justify-self-start font-semibold text-[17px] tracking-[-0.01em]"
        >
          Torrwheel
        </button>

        {/* The field shows focus itself: a 2px accent bar on its left edge. */}
        <div className="order-3 sm:order-none basis-full sm:basis-auto flex-1 min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--color-paper-soft)]",
              "border-l-2 border-transparent focus-within:border-[var(--color-accent)]",
              "transition-colors duration-150",
            )}
          >
            <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              name="filter"
              autoComplete="off"
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-[var(--color-ink-muted)] text-[14px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label={t.searchClear}
                className="size-6 grid place-items-center shrink-0 rounded-[4px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors duration-150"
              >
                <X aria-hidden="true" className="size-3.5 shrink-0" />
              </button>
            )}
          </div>
        </div>

        <div className="order-2 sm:order-none ml-auto sm:ml-0 flex items-center shrink-0 lg:justify-self-end">
          <Tooltip text={t.addHint}>
            <button
              type="button"
              onClick={onAdd}
              aria-label={t.addHint}
              className={cn(
                "flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-md cursor-pointer",
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors duration-150",
              )}
            >
              <Plus aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />
              <span className="hidden sm:inline">{t.add}</span>
            </button>
          </Tooltip>
          {/* The rule stands 12/16px before the gear's icon, as before a text button. */}
          <span aria-hidden="true" className="h-4 w-px mr-3 sm:mr-4 bg-[var(--color-rule)]" />
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}
