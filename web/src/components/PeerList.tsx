import { ArrowDown, ArrowUp, Lock, LockOpen } from "lucide-react";
import type { Peer } from "../lib/api";
import { formatPercent, formatRate } from "../lib/format";
import { useLang } from "../lib/i18n";
import { Flag } from "./Flag";
import { Tooltip } from "./Tooltip";

// Inline and em-sized, so the arrows sit on the digits' baseline.
const ARROW = "inline size-[1.05em] align-[-0.15em]";

// The peers connected right now: address, client, how much each has, both rates.
export function PeerList({ peers }: { peers: Peer[] }) {
  const { t, locale } = useLang();
  if (peers.length === 0) {
    return <p className="py-1 text-[12.5px] text-[var(--color-ink-muted)]">{t.noPeers}</p>;
  }
  // The busiest first.
  const rows = [...peers].sort(
    (a, b) => b.rate_to_client + b.rate_to_peer - (a.rate_to_client + a.rate_to_peer) || a.address.localeCompare(b.address),
  );
  return (
    // One grid for the whole list; equal side columns put the clients on the row's centre line.
    <ul className="max-h-[420px] overflow-y-auto -mx-1 px-1 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-4">
      {rows.map((peer) => (
        <li
          key={`${peer.address}:${peer.port}`}
          className="grid grid-cols-subgrid col-span-2 sm:col-span-3 items-center h-8 text-[11px] tabular-nums text-[var(--color-ink-soft)]"
        >
          <span className="flex items-center gap-2 min-w-0">
            {/* A lock, not Transmission's flag letters: "DE" reads as a country. Shut is `up`, open `warn`. */}
            <Tooltip text={`${peer.is_encrypted ? t.peerEncrypted : t.peerPlain}${peer.is_utp ? " · µTP" : ""}${peer.is_incoming ? ` · ${t.peerIncoming}` : ""}`}>
              <span className={peer.is_encrypted ? "shrink-0 text-[var(--color-up)]" : "shrink-0 text-[var(--color-warn)]"}>
                {peer.is_encrypted ? (
                  <Lock aria-hidden="true" className="size-3.5" />
                ) : (
                  <LockOpen aria-hidden="true" className="size-3.5" />
                )}
              </span>
            </Tooltip>
            <Flag code={peer.country} />
            <span className="truncate font-mono text-[11.5px] text-[var(--color-ink)]">
              {peer.address}:{peer.port}
            </span>
          </span>
          <span className="hidden sm:block truncate text-center text-[12.5px]">{peer.client_name}</span>
          <span className="whitespace-nowrap text-right">
            {formatPercent(peer.progress, locale)}
            <span className="mx-2 text-[var(--color-ink-muted)]">/</span>
            <ArrowDown aria-hidden="true" className={ARROW} strokeWidth={2.5} />
            {formatRate(peer.rate_to_client, t.unit, locale)}
            <ArrowUp aria-hidden="true" className={`${ARROW} ml-2.5`} strokeWidth={2.5} />
            {formatRate(peer.rate_to_peer, t.unit, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
