import { memo } from "react";
import { ArrowDown, ArrowUp, Pause, Play, Trash2, type LucideIcon } from "lucide-react";
import type { Torrent } from "../lib/api";
import { formatBytes, formatPercent, formatRate, formatSpan } from "../lib/format";
import { useLang } from "../lib/i18n";
import { STATUS_COLOR, isStopped, statusKind, statusShare } from "../lib/status";
import { cn } from "../lib/cn";
import { Tooltip } from "./Tooltip";

type Props = {
  torrent: Torrent;
  onSelect: (id: number) => void;
  // Pause a running torrent, resume a paused one.
  onToggle: (torrent: Torrent) => void;
  onRemove: (torrent: Torrent) => void;
  // Every other row takes the paper-soft ground, so rows part without a rule.
  zebra: boolean;
  // The last row closes the block and rounds the bottom corners.
  last: boolean;
};

// Inline and em-sized, so the arrows sit on the digits' baseline.
const ARROW = "inline size-[1.05em] align-[-0.15em]";

// memo: the list is polled every two seconds; a row whose torrent did not
// change stays out of the commit.
export const TorrentRow = memo(function TorrentRow({ torrent, onSelect, onToggle, onRemove, zebra, last }: Props) {
  const { t, locale } = useLang();
  const kind = statusKind(torrent);
  const stopped = isStopped(torrent);
  // A move, a check and a magnet's metadata have a share of their own.
  const bar = statusShare(torrent, kind) ?? torrent.percent_done;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(torrent.id)}
      onKeyDown={(e) => {
        // Only the row itself: a key on a nested button is that button's.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(torrent.id);
        }
      }}
      className={cn(
        "group w-full text-left py-3 sm:py-4 cursor-pointer transition-colors duration-150",
        zebra && "bg-[var(--color-paper-soft)]",
        last && "rounded-b-md",
        "hover:bg-[var(--color-row-hover)]",
        "focus-visible:outline-none focus-visible:bg-[var(--color-row-hover)]",
      )}
    >
      {/* Three lines: name and size, the bar across the whole row, status and rates. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:gap-x-6 gap-y-2 items-center px-3 sm:px-4">
        <h3 className="font-semibold text-[14px] sm:text-[15px] leading-snug tracking-[-0.01em] truncate group-hover:text-[var(--color-accent)] transition-colors duration-150">
          {torrent.name}
        </h3>
        <div className="justify-self-end flex items-center gap-1 text-[12px] tabular-nums whitespace-nowrap">
          <RowButton
            label={stopped ? t.resume : t.pause}
            onClick={() => onToggle(torrent)}
            icon={stopped ? Play : Pause}
          />
          <RowButton label={t.remove} onClick={() => onRemove(torrent)} icon={Trash2} danger />
          <span className="ml-1 font-medium">{formatBytes(torrent.size_when_done, t.unit, locale)}</span>
        </div>

        {/* The share done — the status's own when it has one — with its figure in the middle. */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(bar * 100)}
          className="col-span-2 relative h-4 rounded-[4px] overflow-hidden bg-[var(--color-bar-track)] text-[11px] leading-none font-medium tabular-nums"
        >
          <span className="absolute inset-0 grid place-items-center">{formatPercent(bar, locale)}</span>
          {/* The filled part repeats the figure in its own ink and is clipped to the share. */}
          <span
            aria-hidden="true"
            className="swiss-progress absolute inset-0 grid place-items-center text-[var(--color-bar-ink)]"
            style={{ backgroundColor: STATUS_COLOR[kind], clipPath: `inset(0 ${(1 - bar) * 100}% 0 0)` }}
          >
            {formatPercent(bar, locale)}
          </span>
        </div>

        {/* Centred, each on a line box of its own size: the small capitals sit level with the text. */}
        <div className="flex items-center gap-2 min-w-0 h-4 text-[12px] leading-none text-[var(--color-ink-soft)]">
          <span className="swiss-eyebrow text-[10px] leading-none shrink-0">{t.metaStatus}:</span>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_COLOR[kind] }}
          />
          <span className="truncate tabular-nums leading-4">
            <span className="font-medium" style={{ color: STATUS_COLOR[kind] }}>
              {kind === "error" ? torrent.error_string || t.status.error : t.status[kind]}
            </span>
            {kind === "downloading" && (
              <>
                <span className="text-[var(--color-ink-muted)] mx-2">/</span>
                {t.peers(torrent.peers_connected)}
                {torrent.eta >= 0 && (
                  <>
                    <span className="text-[var(--color-ink-muted)] mx-2">/</span>
                    {t.left(formatSpan(torrent.eta, t.unit))}
                  </>
                )}
              </>
            )}
          </span>
        </div>
        <span className="text-[12px] text-[var(--color-ink-muted)] tabular-nums whitespace-nowrap text-right">
          <ArrowDown aria-hidden="true" className={ARROW} strokeWidth={2.5} />
          {formatRate(torrent.rate_download, t.unit, locale)}
          <ArrowUp aria-hidden="true" className={cn(ARROW, "ml-2.5")} strokeWidth={2.5} />
          {formatRate(torrent.rate_upload, t.unit, locale)}
        </span>
      </div>
    </div>
  );
});

// An icon button inside the row; its click does not open the torrent.
function RowButton({
  label,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** A removal: red at rest. */
  danger?: boolean;
}) {
  return (
    <Tooltip text={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          "size-6 -my-1 grid place-items-center rounded-md cursor-pointer transition-colors duration-150",
          danger
            ? "text-[var(--color-down)] hover:bg-[var(--color-down)]/10"
            : "text-[var(--color-ink-muted)] hover:text-[var(--color-accent)]",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      </button>
    </Tooltip>
  );
}
