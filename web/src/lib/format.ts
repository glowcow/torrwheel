import type { Dict } from "./i18n";

const STEPS = ["b", "kb", "mb", "gb", "tb"] as const;

/** The figure and its unit apart: binary steps under decimal names, one decimal below 100. */
export function bytesParts(bytes: number, unit: Dict["unit"], locale: string): [string, string] {
  let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let step = 0;
  while (value >= 1024 && step < STEPS.length - 1) {
    value /= 1024;
    step++;
  }
  const digits = step === 0 || value >= 100 ? 0 : 1;
  const text = value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return [text, unit[STEPS[step]]];
}

export const formatBytes = (bytes: number, unit: Dict["unit"], locale: string) =>
  bytesParts(bytes, unit, locale).join(" ");

export const formatRate = (bytesPerSecond: number, unit: Dict["unit"], locale: string) =>
  `${formatBytes(bytesPerSecond, unit, locale)}/${unit.s}`;

/** A share of 0 to 1 as a percentage; a decimal only while it is under way. */
export function formatPercent(share: number, locale: string): string {
  const digits = share > 0 && share < 1 ? 1 : 0;
  // Floored: 99.96 % must not read as done.
  const value = Math.floor(share * 1000) / 10;
  return `${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** Unix seconds as dd-mm-yyyy. */
export function formatDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** "2d 7h" / "7h 12m" / "12m" / "40s" from seconds. */
export function formatSpan(seconds: number, unit: Dict["unit"]): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}${unit.s}`;
  const mins = Math.floor(seconds / 60);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}${unit.d} ${h}${unit.h}`;
  if (h > 0) return `${h}${unit.h} ${m}${unit.m}`;
  return `${m}${unit.m}`;
}
