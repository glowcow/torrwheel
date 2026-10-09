/** The daemon's activity code, `tr_torrent_activity`. */
export const Activity = {
  stopped: 0,
  checkWait: 1,
  check: 2,
  downloadWait: 3,
  download: 4,
  seedWait: 5,
  seed: 6,
} as const;

export type Torrent = {
  id: number;
  name: string;
  status: number;
  /** 0 = fine; anything else comes with `error_string`. */
  error: number;
  error_string: string;
  /** Share of the wanted bytes, 0 to 1. */
  percent_done: number;
  /** Bytes of the wanted files, and of those still missing. */
  size_when_done: number;
  left_until_done: number;
  /** Bytes of every file, wanted or not. */
  total_size: number;
  /** Bytes per second. */
  rate_download: number;
  rate_upload: number;
  peers_connected: number;
  /** Seconds; negative when unknown. */
  eta: number;
  /** Unix seconds. */
  added_date: number;
  upload_ratio: number;
  download_dir: string;
  /** Share of the torrent's own description received; below 1 for a fresh magnet link. */
  metadata_percent_complete: number;
  /** Share verified, while the torrent is being checked. */
  recheck_progress: number;
  /** Bytes of a move between directories under way; absent in a daemon without the field. */
  move_bytes_done?: number;
  move_bytes_total?: number;
};

const TORRENT_FIELDS: (keyof Torrent)[] = [
  "id",
  "name",
  "status",
  "error",
  "error_string",
  "percent_done",
  "size_when_done",
  "left_until_done",
  "total_size",
  "rate_download",
  "rate_upload",
  "peers_connected",
  "eta",
  "added_date",
  "upload_ratio",
  "download_dir",
  "metadata_percent_complete",
  "recheck_progress",
  "move_bytes_done",
  "move_bytes_total",
];

export type TorrentFile = { name: string; length: number };
/** -1 low, 0 normal, 1 high. */
export type Priority = -1 | 0 | 1;
export type FileStat = { bytes_completed: number; wanted: boolean; priority: Priority };

export type Peer = {
  address: string;
  port: number;
  client_name: string;
  is_encrypted: boolean;
  is_utp: boolean;
  is_incoming: boolean;
  /** Two-letter country code of the address; absent in a daemon without the field. */
  country?: string;
  progress: number;
  rate_to_client: number;
  rate_to_peer: number;
};

export type TrackerStat = {
  id: number;
  tier: number;
  host: string;
  announce: string;
  is_backup: boolean;
  has_announced: boolean;
  last_announce_succeeded: boolean;
  last_announce_result: string;
  last_announce_peer_count: number;
  /** Unix seconds; 0 when it never happened. */
  last_announce_time: number;
  next_announce_time: number;
  /** -1 when the tracker did not say. */
  seeder_count: number;
  leecher_count: number;
};

/** What the detail view reads on top of the list's fields. */
export type TorrentDetail = Torrent & {
  hash_string: string;
  uploaded_ever: number;
  downloaded_ever: number;
  /** Unix seconds; 0 when unknown. */
  activity_date: number;
  date_created: number;
  creator: string;
  comment: string;
  is_private: boolean;
  piece_count: number;
  piece_size: number;
  files: TorrentFile[];
  file_stats: FileStat[];
  peers: Peer[];
  tracker_stats: TrackerStat[];
};

const DETAIL_FIELDS = [
  ...TORRENT_FIELDS,
  "hash_string",
  "uploaded_ever",
  "downloaded_ever",
  "activity_date",
  "date_created",
  "creator",
  "comment",
  "is_private",
  "piece_count",
  "piece_size",
  "files",
  "file_stats",
  "peers",
  "tracker_stats",
];

/** `download_dirs`: the directories on offer when adding; absent in a daemon without the key. */
export type Session = { version: string; download_dir: string; download_dirs?: string[] };
export type FreeSpace = { path: string; size_bytes: number; total_size: number };

/** A magnet link or URL, or the content of a .torrent file in base64. */
export type AddSource = { filename: string } | { metainfo: string };
export type AddResult = { torrent_added?: { id: number }; torrent_duplicate?: { id: number } };

// Beside the page: the daemon serves both from one root.
const RPC_URL = "rpc";
const SESSION_HEADER = "X-Transmission-Session-Id";

let sessionId = "";
let requestId = 0;

type RpcReply<T> = {
  result?: T;
  error?: { code: number; message: string; data?: { error_string?: string } };
};

// The only fetch in the app. A 409 hands over the CSRF token: resend once with it.
async function rpc<T>(method: string, params: object = {}): Promise<T> {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: ++requestId });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SESSION_HEADER]: sessionId },
      body,
    });
    if (res.status === 409) {
      sessionId = res.headers.get(SESSION_HEADER) ?? "";
      continue;
    }
    if (!res.ok) throw new Error(`${method}: ${res.status}`);
    const reply = (await res.json()) as RpcReply<T>;
    if (reply.error) {
      const detail = reply.error.data?.error_string;
      throw new Error(detail || reply.error.message);
    }
    return reply.result as T;
  }
  throw new Error(`${method}: 409`);
}

export const getTorrents = () =>
  rpc<{ torrents: Torrent[] }>("torrent_get", { fields: TORRENT_FIELDS }).then((r) => r.torrents);

/** null once the torrent is gone from the daemon. */
export const getTorrent = (id: number) =>
  rpc<{ torrents: TorrentDetail[] }>("torrent_get", { ids: [id], fields: DETAIL_FIELDS }).then(
    (r) => r.torrents[0] ?? null,
  );

export const getSession = () => rpc<Session>("session_get", { fields: ["version", "download_dir", "download_dirs"] });
export const getFreeSpace = (path: string) => rpc<FreeSpace>("free_space", { path });

export const startTorrent = (id: number) => rpc("torrent_start", { ids: [id] });
export const stopTorrent = (id: number) => rpc("torrent_stop", { ids: [id] });
export const verifyTorrent = (id: number) => rpc("torrent_verify", { ids: [id] });
export const removeTorrent = (id: number, withData: boolean) =>
  rpc("torrent_remove", { ids: [id], delete_local_data: withData });

export const setFilesWanted = (id: number, indices: number[], wanted: boolean) =>
  rpc("torrent_set", { ids: [id], [wanted ? "files_wanted" : "files_unwanted"]: indices });

/** Without a directory the daemon's own download directory is used. */
const PRIORITY_KEY: Record<Priority, string> = { [-1]: "priority_low", 0: "priority_normal", 1: "priority_high" };
export const setFilesPriority = (id: number, indices: number[], priority: Priority) =>
  rpc("torrent_set", { ids: [id], [PRIORITY_KEY[priority]]: indices });

export const addTorrent = (source: AddSource, downloadDir?: string) =>
  rpc<AddResult>("torrent_add", downloadDir ? { ...source, download_dir: downloadDir } : source);
