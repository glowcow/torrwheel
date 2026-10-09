import { Check, ChevronRight, ChevronsDown, ChevronsUp, Equal, File as FileIcon, Folder, FolderOpen, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import type { FileStat, Priority, TorrentFile } from "../lib/api";
import { formatBytes, formatPercent } from "../lib/format";
import { useLang } from "../lib/i18n";
import { cn } from "../lib/cn";
import { Tooltip } from "./Tooltip";

// `children` present = directory. `indices` are the daemon's file indices under the node.
type Node = {
  name: string;
  path: string;
  size: number;
  done: number;
  indices: number[];
  wanted: number;
  /** null = the files under a folder differ. */
  priority: Priority | null;
  children?: Node[];
};

type Dir = { dirs: Map<string, Dir>; files: { name: string; index: number }[] };

// The daemon sends flat slash-joined paths; sizes and picks roll up here.
function buildTree(files: TorrentFile[], stats: FileStat[]): Node[] {
  const root: Dir = { dirs: new Map(), files: [] };
  files.forEach((file, index) => {
    const parts = file.name.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = dir.dirs.get(parts[i]);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        dir.dirs.set(parts[i], next);
      }
      dir = next;
    }
    dir.files.push({ name: parts[parts.length - 1], index });
  });

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

  // Directories first, then files, each by name.
  const toNodes = (dir: Dir, prefix: string): Node[] => {
    const dirs = [...dir.dirs.entries()].map(([name, d]): Node => {
      const children = toNodes(d, `${prefix}${name}/`);
      return {
        name,
        path: `${prefix}${name}/`,
        size: children.reduce((sum, c) => sum + c.size, 0),
        done: children.reduce((sum, c) => sum + c.done, 0),
        indices: children.flatMap((c) => c.indices),
        wanted: children.reduce((sum, c) => sum + c.wanted, 0),
        priority: children.every((c) => c.priority === children[0].priority) ? children[0].priority : null,
        children,
      };
    });
    const leaves = dir.files.map(
      ({ name, index }): Node => ({
        name,
        path: prefix + name,
        size: files[index].length,
        done: stats[index]?.bytes_completed ?? 0,
        indices: [index],
        wanted: stats[index]?.wanted ? 1 : 0,
        priority: stats[index]?.priority ?? 0,
      }),
    );
    return [...dirs.sort(byName), ...leaves.sort(byName)];
  };
  return toNodes(root, "");
}

type Props = {
  files: TorrentFile[];
  stats: FileStat[];
  onPick: (indices: number[], wanted: boolean) => void;
  onPriority: (indices: number[], priority: Priority) => void;
};

// The torrent's files as a tree; a tick picks a file or a whole folder, the
// arrows set what is downloaded first.
export function FileTree({ files, stats, onPick, onPriority }: Props) {
  const nodes = useMemo(() => buildTree(files, stats), [files, stats]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    // A long listing scrolls here instead of stretching the modal.
    <div className="max-h-[420px] overflow-y-auto -mx-1 px-1">
      <Level nodes={nodes} depth={0} collapsed={collapsed} onToggle={toggle} onPick={onPick} onPriority={onPriority} />
    </div>
  );
}

function Level({
  nodes,
  depth,
  collapsed,
  onToggle,
  onPick,
  onPriority,
}: {
  nodes: Node[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onPick: Props["onPick"];
  onPriority: Props["onPriority"];
}) {
  const { t, locale } = useLang();
  return (
    <ul>
      {nodes.map((n) => {
        const open = !collapsed.has(n.path);
        const state = n.wanted === 0 ? "none" : n.wanted === n.indices.length ? "all" : "some";
        return (
          <li key={n.path}>
            <div className="flex items-center gap-2 h-8" style={{ paddingLeft: depth * 14 }}>
              <Tick
                state={state}
                label={n.children ? t.pickFolder : t.pickFile}
                onChange={() => onPick(n.indices, state !== "all")}
              />
              <PriorityButton priority={n.priority} onChange={(next) => onPriority(n.indices, next)} />
              {n.children ? (
                <button
                  type="button"
                  onClick={() => onToggle(n.path)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 flex items-center gap-1.5 h-8 text-left rounded-[4px] cursor-pointer hover:text-[var(--color-accent)] transition-colors duration-150"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-90")}
                  />
                  {open ? (
                    <FolderOpen aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
                  ) : (
                    <Folder aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
                  )}
                  <span className="min-w-0 truncate text-[12.5px] font-medium">{n.name}</span>
                </button>
              ) : (
                <span className="min-w-0 flex-1 flex items-center gap-1.5">
                  <FileIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
                  <span
                    className={cn(
                      "min-w-0 truncate text-[12.5px]",
                      state === "none" ? "text-[var(--color-ink-muted)]" : "text-[var(--color-ink-soft)]",
                    )}
                  >
                    {n.name}
                  </span>
                </span>
              )}
              {/* One text line set to the right edge: equal gaps on both sides of the slash. */}
              <span className="pl-3 shrink-0 whitespace-nowrap text-[11px] tabular-nums text-[var(--color-ink-soft)]">
                <span className={cn(n.done < n.size && n.done > 0 && "text-[var(--color-accent)]")}>
                  {formatPercent(n.size > 0 ? n.done / n.size : 1, locale)}
                </span>
                <span aria-hidden="true" className="mx-2 text-[var(--color-ink-muted)]">
                  /
                </span>
                {formatBytes(n.size, t.unit, locale)}
              </span>
            </div>
            {n.children && open && (
              <Level
                nodes={n.children}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                onPick={onPick}
                onPriority={onPriority}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// A square tick: accent when picked, a dash when only part of a folder is.
function Tick({ state, label, onChange }: { state: "all" | "some" | "none"; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "size-4 shrink-0 grid place-items-center rounded-[4px] border cursor-pointer transition-colors duration-150",
        state === "none"
          ? "border-[var(--color-ink-muted)] hover:border-[var(--color-accent)]"
          : "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]",
      )}
    >
      {state === "all" && <Check aria-hidden="true" className="size-3" strokeWidth={3} />}
      {state === "some" && <Minus aria-hidden="true" className="size-3" strokeWidth={3} />}
    </button>
  );
}

// One button that steps normal, high, low; a folder with differing files starts from high.
function PriorityButton({ priority, onChange }: { priority: Priority | null; onChange: (next: Priority) => void }) {
  const { t } = useLang();
  const label =
    priority === null ? t.priority.mixed : priority === 1 ? t.priority.high : priority === -1 ? t.priority.low : t.priority.normal;
  const Icon = priority === 1 ? ChevronsUp : priority === -1 ? ChevronsDown : Equal;
  return (
    <Tooltip text={label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => onChange(priority === 1 ? -1 : priority === -1 ? 0 : 1)}
        className={cn(
          "size-6 shrink-0 grid place-items-center rounded-[4px] cursor-pointer transition-colors duration-150 hover:text-[var(--color-accent)]",
          priority === 1 ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]",
        )}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.25} />
      </button>
    </Tooltip>
  );
}
