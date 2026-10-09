import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Totals } from "./components/Totals";
import { SortControl, type Sort } from "./components/SortControl";
import { StatusFilter, type Filter } from "./components/StatusFilter";
import { TorrentRow } from "./components/TorrentRow";
import { DetailDrawer } from "./components/DetailDrawer";
import { AddDialog } from "./components/AddDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Activity, getTorrents, removeTorrent, startTorrent, stopTorrent, type Torrent } from "./lib/api";
import { useLang } from "./lib/i18n";
import { statusKind } from "./lib/status";
import { cn } from "./lib/cn";

// Rates and progress are the moving part.
const TORRENTS_POLL_MS = 2_000;

const SKELETON_ROWS = 6;
const NO_TORRENTS: Torrent[] = [];

// What a filter button holds; checking and queued show under "all" only.
function inFilter(torrent: Torrent, filter: Filter): boolean {
  if (filter === "all") return true;
  const kind = statusKind(torrent);
  if (filter === "downloading") return kind === "downloading" || (kind === "error" && torrent.left_until_done > 0);
  // A stopped torrent is under "paused" whether it is half-way or done.
  if (filter === "paused") return kind === "paused" || kind === "done";
  return kind === filter;
}

function compare(a: Torrent, b: Torrent, key: Sort["key"], locale: string): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: "base" });
    case "size":
      return a.size_when_done - b.size_when_done;
    case "progress":
      return a.percent_done - b.percent_done;
    default:
      // The id settles two added in the same second.
      return a.added_date - b.added_date || a.id - b.id;
  }
}

function App() {
  const { t, locale } = useLang();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>({ key: "added", dir: "desc" });
  // The last viewed id outlives the close, so the modal keeps its content
  // through the closing transition; drawerOpen alone shows it.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const openTorrent = useCallback((id: number) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  const { data, error, isPending } = useQuery({
    queryKey: ["torrents"],
    queryFn: getTorrents,
    refetchInterval: TORRENTS_POLL_MS,
    placeholderData: keepPreviousData,
  });
  const torrents = data ?? NO_TORRENTS;

  // The row's own buttons. The asked-about torrent outlives the dialog's close.
  const queryClient = useQueryClient();
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["torrents"] }), [queryClient]);
  const { mutate: toggle } = useMutation({
    mutationFn: (r: Torrent) => (r.status === Activity.stopped ? startTorrent(r.id) : stopTorrent(r.id)),
    onSettled: refresh,
  });
  const { mutate: remove } = useMutation({ mutationFn: (id: number) => removeTorrent(id, false), onSettled: refresh });
  const [asked, setAsked] = useState<Torrent | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const askRemove = useCallback((r: Torrent) => {
    setAsked(r);
    setAskOpen(true);
  }, []);
  const closeAsk = useCallback(() => setAskOpen(false), []);

  const needle = query.trim().toLocaleLowerCase(locale);
  const named = useMemo(
    () => (needle ? torrents.filter((r) => r.name.toLocaleLowerCase(locale).includes(needle)) : torrents),
    [torrents, needle, locale],
  );
  const counts = useMemo(
    () => ({
      all: named.length,
      downloading: named.filter((r) => inFilter(r, "downloading")).length,
      seeding: named.filter((r) => inFilter(r, "seeding")).length,
      paused: named.filter((r) => inFilter(r, "paused")).length,
    }),
    [named],
  );
  const rows = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    return named.filter((r) => inFilter(r, filter)).sort((a, b) => mul * compare(a, b, sort.key, locale));
  }, [named, filter, sort, locale]);

  // Stuck is read off a zero-height sentinel above the meta row; the margin
  // is the header's measured height, re-armed when the header changes rows.
  const headerRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    let obs: IntersectionObserver | undefined;
    const arm = () => {
      obs?.disconnect();
      const h = Math.round(headerRef.current?.getBoundingClientRect().height ?? 64);
      obs = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
        rootMargin: `-${h + 1}px 0px 0px 0px`,
        threshold: 0,
      });
      obs.observe(node);
    };
    arm();
    const ro = new ResizeObserver(arm);
    if (headerRef.current) ro.observe(headerRef.current);
    return () => {
      ro.disconnect();
      obs?.disconnect();
    };
  }, []);

  return (
    // main absorbs the slack, so the footer sits at the bottom of a short page.
    <div className="min-h-svh flex flex-col">
      <Header
        ref={headerRef}
        query={query}
        onQueryChange={setQuery}
        onAdd={() => setAddOpen(true)}
        onReset={() => {
          setQuery("");
          setFilter("all");
          setSort({ key: "added", dir: "desc" });
          setDrawerOpen(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <main className="flex-1 w-full mx-auto max-w-[1400px] px-6 sm:px-10 lg:px-16">
        <Totals torrents={torrents} />

        <div ref={sentinelRef} aria-hidden="true" className="h-0 w-full" />
        <div
          className={cn(
            "sticky z-20 top-[calc(env(safe-area-inset-top)+var(--header-h))]",
            "border border-[var(--color-rule)]",
            "transition-[border-radius,box-shadow,background-color,border-color,backdrop-filter] duration-300 ease-out",
            // Stuck, the top rule fades: it would double the header's.
            isStuck ? "border-t-transparent rounded-t-none" : "rounded-t-md",
            rows.length === 0 && "rounded-b-md",
            // Frosted only while the list is under it.
            isStuck
              ? "bg-[var(--color-paper)]/85 backdrop-blur-xs shadow-[var(--shadow-header)]"
              : "bg-[var(--color-paper)]",
          )}
        >
          {/* Two rows below lg, one from lg: the Russian labels overflow at sm. */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-x-3 py-3 px-3 sm:px-4">
            <div className="flex items-center flex-nowrap gap-x-3 min-w-0 pb-2.5 lg:pb-0">
              {/* From lg only: narrower, "All" already carries the count. */}
              <p className="hidden lg:block text-[12px] text-[var(--color-ink-soft)] shrink-0 tabular-nums">
                {isPending ? (
                  <span aria-hidden="true" className="swiss-skeleton inline-block align-middle h-3 w-20" />
                ) : (
                  <>
                    <span className="font-medium text-[var(--color-ink)]">{rows.length.toLocaleString(locale)}</span>{" "}
                    {t.torrentCount(rows.length)}
                  </>
                )}
              </p>
              <span aria-hidden="true" className="hidden lg:inline text-[var(--color-rule)] text-[14px] shrink-0">
                /
              </span>
              <StatusFilter value={filter} counts={counts} onChange={setFilter} />
            </div>
            <div aria-hidden="true" className="h-px mx-2 mb-2.5 bg-[var(--color-rule)] lg:hidden" />
            <div className="flex items-center shrink-0 lg:ml-auto">
              <SortControl value={sort} onChange={setSort} />
            </div>
          </div>
        </div>

        {error ? (
          <div className="my-4 p-4 text-[13px] border-l-2 border-[var(--color-down)] bg-[var(--color-down)]/5 text-[var(--color-ink-soft)] rounded-md">
            {t.daemonUnreachable} — {error instanceof Error ? error.message : t.unknownError}
          </div>
        ) : isPending ? (
          <div aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <div key={i} className={cn("px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-2.5", i % 2 === 0 && "bg-[var(--color-paper-soft)]")}>
                <span className="swiss-skeleton h-4 w-1/2" />
                <span className="swiss-skeleton h-4 w-1/4" />
                <span className="swiss-skeleton h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-[var(--color-ink-muted)]">
            {torrents.length === 0 ? t.noTorrents : t.noMatches}
          </p>
        ) : (
          <div className="swiss-results-enter">
            {rows.map((torrent, i) => (
              <TorrentRow
                key={torrent.id}
                torrent={torrent}
                onSelect={openTorrent}
                onToggle={toggle}
                onRemove={askRemove}
                zebra={i % 2 === 0}
                last={i === rows.length - 1}
              />
            ))}
          </div>
        )}
      </main>

      <DetailDrawer torrentId={selectedId} open={drawerOpen} onClose={closeDrawer} />
      <AddDialog open={addOpen} onClose={closeAdd} />
      <ConfirmDialog
        open={askOpen}
        title={t.remove}
        body={asked ? t.removeBody(asked.name) : ""}
        confirmLabel={t.remove}
        onConfirm={() => asked && remove(asked.id)}
        danger
        onClose={closeAsk}
      />

      <Footer />
    </div>
  );
}

export default App;
