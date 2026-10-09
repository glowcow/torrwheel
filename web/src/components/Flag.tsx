import { useLang } from "../lib/i18n";
import { Tooltip } from "./Tooltip";

// Every flag is an asset of its own, fetched only when a peer from there shows up.
const FLAGS = import.meta.glob<string>("../../node_modules/flag-icons/flags/4x3/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
});
const url = (code: string) => FLAGS[`../../node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`];

// A country's flag from its two-letter code, 16 × 12; the same room stays empty for an unknown one.
export function Flag({ code }: { code: string | undefined }) {
  const { locale } = useLang();
  const src = code ? url(code) : undefined;
  if (!code || !src) return <span aria-hidden="true" className="w-4 h-3 shrink-0" />;
  let name = code.toUpperCase();
  try {
    name = new Intl.DisplayNames(locale, { type: "region" }).of(name) ?? name;
  } catch {
    // Not a region the browser knows: the code stands in.
  }
  return (
    <Tooltip text={name}>
      <img src={src} alt={name} width={16} height={12} className="w-4 h-3 shrink-0 rounded-[2px]" />
    </Tooltip>
  );
}
