export type SortKey = "added" | "name" | "size" | "progress";
export type SortDir = "desc" | "asc";
export type Sort = { key: SortKey; dir: SortDir };

export const SORT_KEYS: SortKey[] = ["added", "name", "size", "progress"];
export const DEFAULT_SORT: Sort = { key: "added", dir: "desc" };

const KEY = "sort";

/** The order this viewer left the list in. */
export function readSort(): Sort {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Sort> | null;
    if (stored && SORT_KEYS.includes(stored.key as SortKey) && (stored.dir === "asc" || stored.dir === "desc")) {
      return { key: stored.key as SortKey, dir: stored.dir };
    }
  } catch {
    // Storage unavailable or its value broken: the default order.
  }
  return DEFAULT_SORT;
}

export function rememberSort(sort: Sort) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sort));
  } catch {
    // Storage unavailable: the order lasts until the page is reloaded.
  }
}
