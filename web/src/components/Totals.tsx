import type { Torrent } from "../lib/api";
import { bytesParts } from "../lib/format";
import { useLang } from "../lib/i18n";
import { activityKind, statusKind } from "../lib/status";
import { Tooltip } from "./Tooltip";
import { cn } from "../lib/cn";

type Item = {
  key: "upload" | "left" | "downloading" | "seeding" | "paused" | "errors";
  value: string;
  unit?: string;
  /** Breakpoint classes: the narrow layouts keep only what fits. */
  show: string;
  tone?: string;
};

// The display block: what the daemon is doing in a line, the download rate as
// the big figure, then the rest of its numbers on that figure's baseline.
export function Totals({ torrents }: { torrents: Torrent[] }) {
  const { t, locale } = useLang();
  const sum = (pick: (r: Torrent) => number) => torrents.reduce((total, r) => total + pick(r), 0);
  // By activity, so a torrent being moved to disk counts as the seed it is.
  const count = (kind: ReturnType<typeof activityKind>) => torrents.filter((r) => activityKind(r) === kind).length;
  const downloading = count("downloading");
  const seeding = count("seeding");
  const moving = torrents.filter((r) => statusKind(r) === "moving").length;
  const errors = count("error");

  const [down, downUnit] = bytesParts(sum((r) => r.rate_download), t.unit, locale);
  const [up, upUnit] = bytesParts(sum((r) => r.rate_upload), t.unit, locale);
  const [left, leftUnit] = bytesParts(sum((r) => r.left_until_done), t.unit, locale);
  const per = `/${t.unit.s}`;

  const items: Item[] = [
    { key: "upload", value: up, unit: upUnit + per, show: "flex" },
    { key: "left", value: left, unit: leftUnit, show: "flex" },
    { key: "downloading", value: downloading.toLocaleString(locale), show: "hidden lg:flex" },
    { key: "seeding", value: seeding.toLocaleString(locale), show: "hidden lg:flex" },
    { key: "paused", value: (count("paused") + count("done")).toLocaleString(locale), show: "hidden xl:flex" },
    {
      key: "errors",
      value: errors.toLocaleString(locale),
      show: "flex",
      tone: errors > 0 ? "text-[var(--color-down)]" : undefined,
    },
  ];

  return (
    // 2px less above from sm: the ink gaps to the header's rule and to the meta row then match.
    <section className="py-8 sm:pt-[38px] sm:pb-10">
      <div className="mb-2 sm:mb-3">
        <span className="text-[18px] font-semibold">
          {downloading > 0
            ? t.headline.downloading(downloading)
            : moving > 0
              ? t.headline.moving(moving)
              : seeding > 0
                ? t.headline.seeding(seeding)
                : t.headline.idle}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-y-2 sm:gap-x-2.5">
        <h1 className="font-semibold leading-[0.95] tracking-[-0.03em] tabular-nums text-[40px] sm:text-[48px] lg:text-[56px]">
          {down}
          {/* Below sm the unit joins the figure: there is no room above the label. */}
          <span className="sm:hidden ml-2 text-[16px] font-medium tracking-normal text-[var(--color-ink-soft)]">
            {downUnit}
            {per}
          </span>
        </h1>
        {/* From sm up the label is the only in-flow line; the unit hangs above it. */}
        <div className="relative">
          <span className="hidden sm:block absolute left-0 bottom-full mb-1 whitespace-nowrap font-medium leading-none sm:text-[16px] lg:text-[18px] text-[var(--color-ink-soft)]">
            {downUnit}
            {per}
          </span>
          <p className="text-[12px] leading-none whitespace-nowrap text-[var(--color-ink-muted)]">{t.downloadSpeed}</p>
        </div>

        {/* The daemon's other numbers ride the same baseline as the label. */}
        <div className="flex items-baseline mt-6 sm:mt-0 sm:ml-5 lg:ml-0">
          <span aria-hidden="true" className="hidden lg:block relative top-[3px] w-px h-[28px] mx-5 bg-[var(--color-rule)]" />
          {items.map((it, i) => (
            <div key={it.key} className={cn("items-baseline", it.show)}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="select-none font-light leading-none text-[var(--color-rule)] px-2.5 sm:px-3 text-[28px] sm:text-[30px]"
                >
                  /
                </span>
              )}
              <Tooltip text={t.statHint[it.key]}>
                {/* The value is out of flow; min-width keeps a wide one off the next slash. */}
                <div className="relative min-w-[3rem]">
                  <span
                    className={cn(
                      "absolute left-0 bottom-full mb-[-7px] whitespace-nowrap",
                      "font-semibold leading-none tabular-nums text-[15px] sm:text-[16px]",
                      it.tone,
                    )}
                  >
                    {it.value}
                    {it.unit && (
                      <span className="ml-0.5 text-[11px] font-medium text-[var(--color-ink-muted)]">{it.unit}</span>
                    )}
                  </span>
                  <span className="swiss-eyebrow whitespace-nowrap">{t.stat[it.key]}</span>
                </div>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
