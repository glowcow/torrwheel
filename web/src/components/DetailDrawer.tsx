import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon, ArrowDownUp, Calendar, ChevronRight, Clock, Folder, Gauge, Grid2x2, HardDrive, Hash, Lock, MessageSquare, Pause, PenLine, Play, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getTorrent, removeTorrent, setFilesPriority, setFilesWanted, startTorrent, stopTorrent, verifyTorrent, type Priority } from "../lib/api";
import { formatBytes, formatDate, formatPercent, formatRate, formatSpan } from "../lib/format";
import { useLang } from "../lib/i18n";
import { STATUS_COLOR, isStopped, statusKind, statusShare } from "../lib/status";
import { cn } from "../lib/cn";
import { Collapse } from "./Collapse";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileTree } from "./FileTree";
import { PeerList } from "./PeerList";
import { TrackerList } from "./TrackerList";
import { MetaLabel } from "./MetaRow";

type Props = {
  // The last viewed torrent: kept after the close, so the content stays
  // rendered through the closing transition.
  torrentId: number | null;
  open: boolean;
  onClose: () => void;
};

const BUTTON = cn(
  "flex-1 basis-0 min-w-[120px] h-11 px-4 rounded-md cursor-pointer transition-colors duration-150",
  "flex items-center justify-center gap-2 whitespace-nowrap",
  "text-[11px] font-semibold uppercase tracking-[0.08em]",
);
const OUTLINED = "border border-[var(--color-rule)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]";
// A removal is red before it is touched.
const DANGER = "border border-[var(--color-down)]/50 text-[var(--color-down)] hover:border-[var(--color-down)] hover:bg-[var(--color-down)]/10";

// One torrent: what it is doing, what can be done to it, and its files.
export function DetailDrawer({ torrentId, open, onClose }: Props) {
  const { t, locale } = useLang();
  const queryClient = useQueryClient();
  // Which removal is being asked about; null = no question on screen.
  const [confirm, setConfirm] = useState<"keep" | "delete" | null>(null);

  // Which sections are unfolded; the files are what one comes for.
  const [unfolded, setUnfolded] = useState({ files: true, peers: false, trackers: false });
  const toggle = (key: keyof typeof unfolded) => setUnfolded((u) => ({ ...u, [key]: !u[key] }));

  const { data, isPending, error, dataUpdatedAt } = useQuery({
    queryKey: ["torrent", torrentId],
    queryFn: () => getTorrent(torrentId!),
    enabled: torrentId !== null && open,
    refetchInterval: 2_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["torrents"] });
    queryClient.invalidateQueries({ queryKey: ["torrent", torrentId] });
  };
  const act = useMutation({ mutationFn: (fn: (id: number) => Promise<unknown>) => fn(torrentId!), onSettled: refresh });
  const pick = useMutation({
    mutationFn: ({ indices, wanted }: { indices: number[]; wanted: boolean }) =>
      setFilesWanted(torrentId!, indices, wanted),
    onSettled: refresh,
  });
  const prioritise = useMutation({
    mutationFn: ({ indices, priority }: { indices: number[]; priority: Priority }) =>
      setFilesPriority(torrentId!, indices, priority),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (withData: boolean) => removeTorrent(torrentId!, withData),
    onSuccess: onClose,
    onSettled: refresh,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The question on top takes its own Escape.
      if (e.key === "Escape" && confirm === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, confirm]);

  // The moment the reply landed: "ago" and "next in" are counted from it, not from a clock read in render.
  const now = Math.floor(dataUpdatedAt / 1000);
  const kind = data ? statusKind(data) : null;
  const stopped = data ? isStopped(data) : false;
  const share = data && kind ? statusShare(data, kind) : null;
  const failure = act.error ?? pick.error ?? prioritise.error ?? remove.error;

  return (
    // Always mounted, opened by CSS.
    <div inert={!open} className={open ? "swiss-drawer-open" : "swiss-drawer-closed"}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="swiss-drawer-backdrop fixed inset-0 z-40 bg-[var(--color-scrim)] backdrop-blur-xs"
      />
      <div
        className={cn(
          "fixed inset-0 z-50 grid place-items-center p-4 sm:p-6 pointer-events-none",
          "pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <aside
          role="dialog"
          aria-modal="true"
          className={cn(
            "swiss-drawer-panel pointer-events-auto flex flex-col overflow-hidden rounded-lg",
            "w-full max-w-4xl max-h-[calc(100svh-2rem)]",
            "bg-[var(--color-paper)] border border-[var(--color-rule)]",
          )}
        >
          <div className="flex items-center justify-between px-5 sm:px-6 h-14 sm:h-16 shrink-0 swiss-rule">
            <div className="swiss-eyebrow">
              {t.torrent} / <span className="tabular-nums">#{torrentId}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="size-10 grid place-items-center -mr-2 rounded-md cursor-pointer text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors duration-150"
            >
              <X aria-hidden="true" className="size-4 shrink-0" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
            {error ? (
              <ErrorBlock>{error instanceof Error ? error.message : t.unknownError}</ErrorBlock>
            ) : isPending ? (
              <div className="text-[14px] text-[var(--color-ink-muted)]">{t.loading}</div>
            ) : data === null ? (
              <div className="text-[14px] text-[var(--color-ink-muted)]">{t.gone}</div>
            ) : (
              data &&
              kind && (
                <>
                  <h2 className="text-[22px] sm:text-[28px] font-bold leading-tight tracking-[-0.02em] break-words">
                    {data.name}
                  </h2>

                  <div className="swiss-rule-top swiss-rule py-4">
                    {/* The label column fits its widest label, so values share one edge. */}
                    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px]">
                      <Row icon={<ActivityIcon className="size-3.5 shrink-0" />} label={t.metaStatus}>
                        <span className="font-medium" style={{ color: STATUS_COLOR[kind] }}>
                          {kind === "error" ? data.error_string || t.status.error : t.status[kind]}
                        </span>
                        {share !== null && <Sub>{formatPercent(share, locale)}</Sub>}
                        {kind === "moving" && (
                          <Sub>
                            {formatBytes(data.move_bytes_done ?? 0, t.unit, locale)} {t.of}{" "}
                            {formatBytes(data.move_bytes_total ?? 0, t.unit, locale)}
                          </Sub>
                        )}
                        {kind === "downloading" && data.eta >= 0 && (
                          <Sub>{t.left(formatSpan(data.eta, t.unit))}</Sub>
                        )}
                      </Row>
                      <Row icon={<Gauge className="size-3.5 shrink-0" />} label={t.metaProgress}>
                        {formatPercent(data.percent_done, locale)}
                        <Sub>
                          {formatBytes(data.size_when_done - data.left_until_done, t.unit, locale)} {t.of}{" "}
                          {formatBytes(data.size_when_done, t.unit, locale)}
                        </Sub>
                      </Row>
                      <Row icon={<HardDrive className="size-3.5 shrink-0" />} label={t.metaSize}>
                        {formatBytes(data.total_size, t.unit, locale)}
                      </Row>
                      <Row icon={<Users className="size-3.5 shrink-0" />} label={t.metaPeers}>
                        {data.peers_connected.toLocaleString(locale)}
                        <Sub>
                          ↓ {formatRate(data.rate_download, t.unit, locale)} · ↑ {formatRate(data.rate_upload, t.unit, locale)}
                        </Sub>
                      </Row>
                      <Row icon={<ArrowDownUp className="size-3.5 shrink-0" />} label={t.metaTransfer}>
                        {formatBytes(data.downloaded_ever, t.unit, locale)} {t.downloaded}
                        <Sub>
                          {formatBytes(data.uploaded_ever, t.unit, locale)} {t.uploaded}
                        </Sub>
                        <Sub>
                          {t.metaRatio.toLocaleLowerCase(locale)}{" "}
                          {Math.max(0, data.upload_ratio).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Sub>
                      </Row>
                      <Row icon={<Clock className="size-3.5 shrink-0" />} label={t.metaActivity}>
                        {data.activity_date > 0 ? t.ago(formatSpan(Math.max(0, now - data.activity_date), t.unit)) : t.never}
                      </Row>
                      <Row icon={<Folder className="size-3.5 shrink-0" />} label={t.metaLocation}>
                        <span className="font-mono text-[11.5px] break-all">{data.download_dir}</span>
                      </Row>
                      <Row icon={<Calendar className="size-3.5 shrink-0" />} label={t.metaAdded}>
                        {formatDate(data.added_date)}
                      </Row>
                      <Row icon={<Hash className="size-3.5 shrink-0" />} label={t.metaHash}>
                        <span className="font-mono text-[11.5px] break-all">{data.hash_string}</span>
                      </Row>
                      <Row icon={<Grid2x2 className="size-3.5 shrink-0" />} label={t.metaPieces}>
                        {data.piece_count.toLocaleString(locale)} × {formatBytes(data.piece_size, t.unit, locale)}
                      </Row>
                      <Row icon={<Lock className="size-3.5 shrink-0" />} label={t.metaPrivacy}>
                        {data.is_private ? t.privateTorrent : t.publicTorrent}
                      </Row>
                      {(data.creator || data.date_created > 0) && (
                        <Row icon={<PenLine className="size-3.5 shrink-0" />} label={t.metaOrigin}>
                          {data.date_created > 0 && formatDate(data.date_created)}
                          {data.creator && (data.date_created > 0 ? <Sub>{data.creator}</Sub> : data.creator)}
                        </Row>
                      )}
                      {data.comment && (
                        <Row icon={<MessageSquare className="size-3.5 shrink-0" />} label={t.metaComment}>
                          <span className="break-words">{data.comment}</span>
                        </Row>
                      )}
                    </dl>
                  </div>

                  {failure && <ErrorBlock>{failure instanceof Error ? failure.message : t.unknownError}</ErrorBlock>}

                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => act.mutate(stopped ? startTorrent : stopTorrent)}
                      className={cn(BUTTON, "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]")}
                    >
                      {stopped ? (
                        <Play aria-hidden="true" className="size-4 shrink-0" />
                      ) : (
                        <Pause aria-hidden="true" className="size-4 shrink-0" />
                      )}
                      {stopped ? t.resume : t.pause}
                    </button>
                    <button type="button" onClick={() => act.mutate(verifyTorrent)} className={cn(BUTTON, OUTLINED)}>
                      <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
                      {t.verify}
                    </button>
                    <button type="button" onClick={() => setConfirm("keep")} className={cn(BUTTON, DANGER)}>
                      <Trash2 aria-hidden="true" className="size-4 shrink-0" />
                      {t.remove}
                    </button>
                    <button type="button" onClick={() => setConfirm("delete")} className={cn(BUTTON, DANGER)}>
                      <Trash2 aria-hidden="true" className="size-4 shrink-0" />
                      {t.removeWithData}
                    </button>
                  </div>

                  <Section
                    title={t.files}
                    count={data.files.length}
                    note={t.wantedOf(data.file_stats.filter((f) => f.wanted).length, data.files.length)}
                    open={unfolded.files}
                    onToggle={() => toggle("files")}
                  >
                    <FileTree
                      files={data.files}
                      stats={data.file_stats}
                      onPick={(indices, wanted) => pick.mutate({ indices, wanted })}
                      onPriority={(indices, priority) => prioritise.mutate({ indices, priority })}
                    />
                  </Section>
                  <Section
                    title={t.peersTitle}
                    count={data.peers.length}
                    open={unfolded.peers}
                    onToggle={() => toggle("peers")}
                  >
                    <PeerList peers={data.peers} />
                  </Section>
                  <Section
                    title={t.trackersTitle}
                    count={data.tracker_stats.length}
                    open={unfolded.trackers}
                    onToggle={() => toggle("trackers")}
                  >
                    <TrackerList trackers={data.tracker_stats} now={now} />
                  </Section>
                </>
              )
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "delete" ? t.removeWithData : t.remove}
        body={data ? (confirm === "delete" ? t.removeWithDataBody(data.name) : t.removeBody(data.name)) : ""}
        confirmLabel={confirm === "delete" ? t.removeWithData : t.remove}
        onConfirm={() => remove.mutate(confirm === "delete")}
        danger
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

// Two grid cells: the parent <dl> owns the columns.
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <>
      <MetaLabel icon={icon} label={label} />
      <dd className="min-w-0 leading-5 tabular-nums">{children}</dd>
    </>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <span className="text-[var(--color-ink-muted)]">
      <span className="mx-2">/</span>
      {children}
    </span>
  );
}

function ErrorBlock({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 text-[13px] border-l-2 border-[var(--color-down)] bg-[var(--color-down)]/5 text-[var(--color-ink-soft)] rounded-md">
      {children}
    </div>
  );
}

// A part of the modal under its own hairline that folds on its title.
function Section({
  title,
  count,
  note,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  note?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="swiss-rule-top pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 swiss-eyebrow rounded-[4px] cursor-pointer hover:text-[var(--color-accent)] transition-colors duration-150"
      >
        <ChevronRight
          aria-hidden="true"
          strokeWidth={2.25}
          className={cn("size-3 shrink-0 transition-transform duration-300", open && "rotate-90")}
        />
        {title}: <span className="tabular-nums">{count}</span>
        {note && <span className="normal-case tracking-normal font-normal text-[var(--color-ink-muted)]">{note}</span>}
      </button>
      <Collapse open={open} className="pt-2">
        {children}
      </Collapse>
    </section>
  );
}
