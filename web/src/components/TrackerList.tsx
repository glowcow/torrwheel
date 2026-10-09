import type { TrackerStat } from "../lib/api";
import { formatSpan } from "../lib/format";
import { useLang } from "../lib/i18n";
import { StatusDot, type DotState } from "./StatusDot";

function dot(tracker: TrackerStat): DotState {
  if (!tracker.has_announced) return "unknown";
  return tracker.last_announce_succeeded ? "ok" : "down";
}

// The trackers by tier: what the last announce said, when the next one is,
// and the swarm each reports. `now` is the moment the reply landed, in seconds.
export function TrackerList({ trackers, now }: { trackers: TrackerStat[]; now: number }) {
  const { t, locale } = useLang();
  if (trackers.length === 0) {
    return <p className="py-1 text-[12.5px] text-[var(--color-ink-muted)]">{t.noTrackers}</p>;
  }
  const tiers = [...new Set(trackers.map((tr) => tr.tier))].sort((a, b) => a - b);
  const slash = <span className="mx-2 text-[var(--color-ink-muted)]">/</span>;

  return (
    <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 space-y-3">
      {tiers.map((tier) => (
        <div key={tier}>
          <div className="swiss-eyebrow text-[10px] mb-1">{t.tier(tier + 1)}</div>
          <ul>
            {trackers
              .filter((tr) => tr.tier === tier)
              .map((tr) => {
                const state = dot(tr);
                const result = tr.has_announced
                  ? tr.last_announce_succeeded
                    ? t.announceOk(tr.last_announce_peer_count)
                    : tr.last_announce_result || t.announceFailed
                  : t.announceNever;
                return (
                  <li key={tr.id} className="py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot state={state} label={result} />
                      <span className="truncate text-[12.5px] font-medium">{tr.host || tr.announce}</span>
                      {tr.is_backup && <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]">{t.trackerBackup}</span>}
                    </div>
                    <div className="pl-4 text-[11px] tabular-nums text-[var(--color-ink-soft)] truncate">
                      <span className={state === "down" ? "text-[var(--color-down)]" : undefined}>{result}</span>
                      {tr.has_announced && tr.last_announce_time > 0 && (
                        <>
                          {slash}
                          {t.ago(formatSpan(Math.max(0, now - tr.last_announce_time), t.unit))}
                        </>
                      )}
                      {tr.next_announce_time > now && (
                        <>
                          {slash}
                          {t.nextIn(formatSpan(tr.next_announce_time - now, t.unit))}
                        </>
                      )}
                      {tr.seeder_count >= 0 && (
                        <>
                          {slash}
                          {t.swarm(tr.seeder_count.toLocaleString(locale), Math.max(0, tr.leecher_count).toLocaleString(locale))}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
