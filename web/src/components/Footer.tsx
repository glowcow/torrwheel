import { useQuery } from "@tanstack/react-query";
import { getSession } from "../lib/api";
import { useLang } from "../lib/i18n";
import { StatusDot } from "./StatusDot";
import { Tooltip } from "./Tooltip";
import { cn } from "../lib/cn";

// The build passes the git tag; the footer adds its own "v".
const VERSION = (import.meta.env.VITE_APP_VERSION ?? "dev").replace(/^v/, "");
const COMMIT = import.meta.env.VITE_APP_COMMIT ?? "local";
const BUILD_DATE = (import.meta.env.VITE_APP_BUILD_DATE ?? new Date().toISOString()).slice(0, 10);

// One hairline as wide as the text, then centred lines of slash-separated
// stamps: this build, then the daemon the page talks to.
export function Footer() {
  const { t } = useLang();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    refetchInterval: 300_000,
  });
  const version = session.data?.version;

  return (
    <footer className="mx-auto max-w-[1400px] px-6 sm:px-10 lg:px-16 mt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="swiss-rule-top py-5 px-3 sm:px-4 flex flex-col items-center gap-y-1 text-[11.5px] text-[var(--color-ink-muted)] tabular-nums">
        <span className="flex items-center gap-x-2 sm:gap-x-3 whitespace-nowrap">
          <Wordmark>Torrwheel:</Wordmark>
          <span>v{VERSION}</span>
          {/* The hash is the first stamp to go on a narrow screen. */}
          <Slash className="hidden sm:inline" />
          <Tooltip text={COMMIT}>
            <span className="hidden sm:inline font-mono">{COMMIT.slice(0, 7)}</span>
          </Tooltip>
          <Slash />
          <span>
            <span className="hidden sm:inline">{t.built} </span>
            {BUILD_DATE}
          </span>
        </span>

        <span className="flex items-center gap-x-2 sm:gap-x-3 whitespace-nowrap">
          <StatusDot
            state={version ? "ok" : session.isPending ? "unknown" : "down"}
            label={version || session.isPending ? t.daemon : t.daemonUnreachable}
          />
          <Wordmark>{`${t.daemon}:`}</Wordmark>
          {version ? (
            <span>{version}</span>
          ) : session.isError ? (
            <span>{t.unreachable}</span>
          ) : (
            <span aria-hidden="true" className="swiss-skeleton h-2.5 w-24" />
          )}
        </span>

        {/* The country database's licence asks for this line. */}
        <a
          href="https://db-ip.com"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[4px] hover:text-[var(--color-accent)] transition-colors duration-150"
        >
          {t.geoCredit}
        </a>
      </div>
    </footer>
  );
}

function Wordmark({ children }: { children: string }) {
  return (
    <span className="font-semibold text-[13px] tracking-[-0.01em] text-[var(--color-ink)]">
      {children}
    </span>
  );
}

function Slash({ className }: { className?: string }) {
  return <span className={cn("text-[var(--color-rule)]", className)}>/</span>;
}
