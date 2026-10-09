import { Activity, type Torrent } from "./api";

export type StatusKind =
  | "paused"
  | "done"
  | "checking"
  | "queued"
  | "metadata"
  | "downloading"
  | "moving"
  | "seeding"
  | "error";

/** Fixed in every theme and scheme: downloading and seeding `up`, a move violet, waiting `warn`, failed `down`, a pause grey. */
export const STATUS_COLOR: Record<StatusKind, string> = {
  downloading: "var(--color-up)",
  moving: "var(--color-status-move)",
  seeding: "var(--color-up)",
  metadata: "var(--color-warn)",
  checking: "var(--color-warn)",
  queued: "var(--color-warn)",
  paused: "var(--color-status-idle)",
  done: "var(--color-status-idle)",
  error: "var(--color-down)",
};

type Subject = Pick<
  Torrent,
  | "status"
  | "error"
  | "percent_done"
  | "metadata_percent_complete"
  | "recheck_progress"
  | "move_bytes_done"
  | "move_bytes_total"
>;

/** Stopped, whatever it has: paused or done. The button then says "resume". */
export const isStopped = (torrent: Pick<Torrent, "status">) => torrent.status === Activity.stopped;

/** What a torrent is doing, in the list's own terms; an error outranks a move, a move the activity. */
export function statusKind(torrent: Subject): StatusKind {
  if (torrent.error !== 0) return "error";
  if ((torrent.move_bytes_total ?? 0) > 0) return "moving";
  return activityKind(torrent);
}

/** The same without the move: a torrent whose files are being moved still seeds, or stays paused. */
export function activityKind(torrent: Subject): StatusKind {
  if (torrent.error !== 0) return "error";
  switch (torrent.status) {
    case Activity.stopped:
      // Stopped with everything wanted on disk is "done", not "paused".
      return torrent.percent_done >= 1 ? "done" : "paused";
    case Activity.checkWait:
    case Activity.check:
      return "checking";
    case Activity.downloadWait:
    case Activity.seedWait:
      return "queued";
    case Activity.download:
      return torrent.metadata_percent_complete < 1 ? "metadata" : "downloading";
    default:
      return "seeding";
  }
}

/** How far the status's own work has come, 0 to 1; null where the status has no such share. */
export function statusShare(torrent: Subject, kind: StatusKind): number | null {
  if (kind === "moving") return (torrent.move_bytes_done ?? 0) / (torrent.move_bytes_total ?? 1);
  if (kind === "metadata") return torrent.metadata_percent_complete;
  if (kind === "checking" && torrent.status === Activity.check) return torrent.recheck_progress;
  return null;
}
