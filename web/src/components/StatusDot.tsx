import { cn } from "../lib/cn";
import { Tooltip } from "./Tooltip";

/** unknown = not probed yet (or the probe itself is unreachable). */
export type DotState = "ok" | "degraded" | "down" | "unknown";

const COLOR: Record<DotState, string> = {
  ok: "var(--color-up)",
  degraded: "var(--color-warn)",
  down: "var(--color-down)",
  unknown: "var(--color-rule)",
};

// Reachable and working / answering with an error / no answer at all.
export function StatusDot({
  state,
  label,
  className,
}: {
  state: DotState;
  /** The reading, as tooltip and aria-label. */
  label: string;
  className?: string;
}) {
  return (
    <Tooltip text={label}>
      <span
        role="img"
        aria-label={label}
        className={cn("size-2 shrink-0 rounded-full", className)}
        style={{ backgroundColor: COLOR[state] }}
      />
    </Tooltip>
  );
}
