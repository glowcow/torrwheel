import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { FileUp, Link, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addTorrent, getFreeSpace, getSession, getTorrents, type AddSource } from "../lib/api";
import { readDirs, rememberDir } from "../lib/dirs";
import { formatBytes } from "../lib/format";
import { useLang } from "../lib/i18n";
import { cn } from "../lib/cn";
import { DirPicker } from "./DirPicker";

const BUTTON = cn(
  "flex-1 basis-0 h-11 px-4 rounded-md cursor-pointer transition-colors duration-150",
  "text-[11px] font-semibold uppercase tracking-[0.08em]",
);

// A .torrent file as the base64 the daemon takes.
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// A magnet link or a .torrent file, handed to the daemon as it is.
export function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useLang();
  const queryClient = useQueryClient();
  const [link, setLink] = useState("");
  // null = untouched: the field shows the daemon's own download directory.
  const [dirInput, setDirInput] = useState<string | null>(null);
  // The directory whose free space is shown; follows the field on blur, not on every key.
  const [checkedDir, setCheckedDir] = useState<string | null>(null);
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: getSession, refetchInterval: 300_000 });
  const dir = (dirInput ?? session?.download_dir ?? "").trim();
  const spaceDir = checkedDir ?? session?.download_dir;
  const space = useQuery({
    queryKey: ["free-space", spaceDir],
    queryFn: () => getFreeSpace(spaceDir!),
    enabled: open && !!spaceDir,
    placeholderData: keepPreviousData,
  });
  // On offer: the daemon's own directory, where its torrents already lie, and
  // what this viewer added to before. The list's cache is read, not fetched.
  const { data: torrents } = useQuery({ queryKey: ["torrents"], queryFn: getTorrents, enabled: false });
  const [remembered, setRemembered] = useState(readDirs);
  const dirs = useMemo(
    () => [...new Set([session?.download_dir, ...(torrents ?? []).map((r) => r.download_dir), ...remembered])]
      .filter((d): d is string => !!d),
    [session, torrents, remembered],
  );
  const [file, setFile] = useState<File | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setLink("");
    setDirInput(null);
    setCheckedDir(null);
    setFile(null);
    setDuplicate(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = () => {
    add.reset();
    reset();
    onClose();
  };

  const add = useMutation({
    mutationFn: async () => {
      const source: AddSource = file ? { metainfo: await toBase64(file) } : { filename: link.trim() };
      return addTorrent(source, dir || undefined);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["torrents"] });
      if (result.torrent_duplicate) return setDuplicate(true);
      if (dir) {
        rememberDir(dir);
        setRemembered(readDirs());
      }
      close();
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const ready = file !== null || link.trim() !== "";

  return (
    <div
      inert={!open}
      className={cn("fixed inset-0 z-40 grid place-items-center p-4", open ? "swiss-drawer-open" : "swiss-drawer-closed")}
    >
      <div
        aria-hidden="true"
        onClick={close}
        className="swiss-drawer-backdrop absolute inset-0 bg-[var(--color-scrim)] backdrop-blur-xs"
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !add.isPending) add.mutate();
        }}
        className={cn(
          // No overflow-hidden: the directory list may hang below the panel.
          "swiss-drawer-panel relative z-50 w-full max-w-md rounded-lg",
          "border border-[var(--color-rule)] bg-[var(--color-paper)]",
        )}
      >
        <div className="swiss-rule h-14 sm:h-16 pl-5 sm:pl-6 pr-2 sm:pr-3 flex items-center justify-between gap-3">
          <h2 id="add-title" className="swiss-eyebrow truncate">
            {t.addTitle}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t.close}
            className="size-10 grid place-items-center shrink-0 rounded-md cursor-pointer text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors duration-150"
          >
            <X aria-hidden="true" className="size-4 shrink-0" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <label htmlFor="add-link" className="swiss-eyebrow block mb-2">
            {t.addLinkLabel}
          </label>
          <div
            className={cn(
              "flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--color-paper-soft)]",
              "border-l-2 border-transparent focus-within:border-[var(--color-accent)] transition-colors duration-150",
              file && "opacity-60",
            )}
          >
            <Link aria-hidden="true" className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
            <input
              id="add-link"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setDuplicate(false);
              }}
              disabled={file !== null}
              placeholder={t.addLinkPlaceholder}
              autoComplete="off"
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-[var(--color-ink-muted)] text-[14px]"
            />
          </div>

          <div className="swiss-eyebrow mt-5 mb-2">{t.addFileLabel}</div>
          <input
            ref={fileRef}
            type="file"
            accept=".torrent,application/x-bittorrent"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setDuplicate(false);
            }}
          />
          <div className="flex items-center gap-2 h-9 rounded-md bg-[var(--color-paper-soft)] pl-3 pr-1">
            <FileUp aria-hidden="true" className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex-1 min-w-0 h-9 text-left truncate text-[14px] cursor-pointer rounded-[4px]",
                file ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-accent)]",
                "transition-colors duration-150",
              )}
            >
              {file ? file.name : t.addChooseFile}
            </button>
            {file && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                aria-label={t.searchClear}
                className="size-6 grid place-items-center shrink-0 rounded-[4px] cursor-pointer text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors duration-150"
              >
                <X aria-hidden="true" className="size-3.5 shrink-0" />
              </button>
            )}
          </div>

          <label htmlFor="add-dir" className="swiss-eyebrow block mt-5 mb-2">
            {t.addDirLabel}
          </label>
          <DirPicker
            id="add-dir"
            value={dirInput ?? session?.download_dir ?? ""}
            onChange={setDirInput}
            onSettle={(d) => setCheckedDir(d || null)}
            dirs={dirs}
          />
          <p className="mt-1.5 h-4 text-[11.5px] tabular-nums text-[var(--color-ink-muted)]">
            {space.isError
              ? t.addDirUnknown
              : space.data && space.data.size_bytes >= 0
                ? t.addDirFree(formatBytes(space.data.size_bytes, t.unit, locale))
                : space.data
                  ? t.addDirUnknown
                  : ""}
          </p>

          {(add.error || duplicate) && (
            <div className="mt-5 p-4 text-[13px] border-l-2 border-[var(--color-down)] bg-[var(--color-down)]/5 text-[var(--color-ink-soft)] rounded-md">
              {duplicate ? t.addDuplicate : add.error instanceof Error ? add.error.message : t.unknownError}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={close}
              className={cn(BUTTON, "border border-[var(--color-rule)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]")}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={!ready || add.isPending}
              className={cn(
                BUTTON,
                "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-accent)]",
              )}
            >
              {t.add}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
