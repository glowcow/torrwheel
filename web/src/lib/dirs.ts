const KEY = "dirs";
const LIMIT = 8;

/** Directories this viewer has added torrents to, newest first. */
export function readDirs(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export function rememberDir(dir: string) {
  try {
    const next = [dir, ...readDirs().filter((d) => d !== dir)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the list offers what the daemon knows.
  }
}
