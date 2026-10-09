import { useQueries } from "@tanstack/react-query";
import { Check, ChevronDown, Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getFreeSpace } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useLang } from "../lib/i18n";
import { cn } from "../lib/cn";

type Props = {
  id: string;
  value: string;
  onChange: (dir: string) => void;
  // The field lost focus or a row was picked: the value is settled.
  onSettle: (dir: string) => void;
  /** The directories on offer; the field takes any other path as well. */
  dirs: string[];
};

// A path field with the known directories in a panel under it, each with the
// room the daemon reports there.
export function DirPicker({ id, value, onChange, onSettle, dirs }: Props) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const spaces = useQueries({
    queries: dirs.map((dir) => ({
      queryKey: ["free-space", dir],
      queryFn: () => getFreeSpace(dir),
      enabled: open,
      staleTime: 30_000,
    })),
  });

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 h-9 pl-3 pr-1 rounded-md bg-[var(--color-paper-soft)]",
          "border-l-2 border-transparent focus-within:border-[var(--color-accent)] transition-colors duration-150",
        )}
      >
        <Folder aria-hidden="true" className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onSettle(value.trim())}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[13px]"
        />
        <button
          type="button"
          aria-label={t.addDirList}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "size-7 grid place-items-center shrink-0 rounded-[4px] cursor-pointer transition-colors duration-150",
            open ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
          )}
        >
          <ChevronDown
            aria-hidden="true"
            strokeWidth={2.25}
            className={cn("size-4 shrink-0 transition-transform duration-150", open && "rotate-180")}
          />
        </button>
      </div>

      {/* Always mounted, opened by CSS like the settings panel. */}
      <ul
        role="listbox"
        inert={!open}
        className={cn(
          "absolute left-0 right-0 top-full mt-1 z-50 p-1 rounded-md",
          "border border-[var(--color-rule)] bg-[var(--color-paper)] shadow-[var(--shadow-menu)]",
          "origin-top transition-[opacity,translate,scale] duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "opacity-100" : "opacity-0 pointer-events-none translate-y-2 scale-[0.98]",
        )}
      >
        {dirs.map((dir, i) => {
          const space = spaces[i]?.data;
          return (
            <li key={dir} role="option" aria-selected={dir === value.trim()}>
              <button
                type="button"
                onClick={() => {
                  onChange(dir);
                  onSettle(dir);
                  setOpen(false);
                }}
                className="w-full h-9 px-2 flex items-center gap-3 rounded-[4px] cursor-pointer text-left transition-colors duration-150 hover:bg-[var(--color-row-hover)]"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{dir}</span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--color-ink-muted)]">
                  {space && space.size_bytes >= 0 ? t.addDirFree(formatBytes(space.size_bytes, t.unit, locale)) : ""}
                </span>
                <Check
                  aria-hidden="true"
                  className={cn("size-4 shrink-0 text-[var(--color-accent)]", dir !== value.trim() && "invisible")}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
