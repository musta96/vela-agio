// Client mirror of supabase/functions/_shared/providers.ts normalizeSymbol.
// Used to dedupe holdings & watchlist entries (P5 #26).

const ISIN_PREFIX_TO_SUFFIX: Record<string, string> = {
  IT: ".MI", FR: ".PA", DE: ".DE", ES: ".MC", NL: ".AS", BE: ".BR",
  CH: ".SW", GB: ".L", PT: ".LS", AT: ".VI", FI: ".HE", SE: ".ST",
  DK: ".CO", NO: ".OL", US: "",
};

export function isIsin(s: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s.trim().toUpperCase());
}

export function normalizeSymbol(raw: string, hintCountry?: string): string {
  if (!raw) return raw;
  let s = raw.trim().toUpperCase();
  s = s.replace(/(\.[A-Z]{1,3})\1+$/i, "$1");
  if (isIsin(s)) {
    const suffix = ISIN_PREFIX_TO_SUFFIX[s.slice(0, 2)] ?? "";
    return s + (suffix ? `@${suffix}` : "");
  }
  if (!s.includes(".") && !s.includes("=") && !s.includes("^") && hintCountry === "IT") {
    s = `${s}.MI`;
  }
  return s;
}

/** Dedupe an array of `{ symbol, ... }` rows by normalized symbol, summing a numeric field if requested. */
export function dedupeBySymbol<T extends { symbol: string }>(
  rows: T[],
  opts?: { hintCountry?: string; sumFields?: (keyof T)[] },
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeSymbol(row.symbol, opts?.hintCountry);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, symbol: key });
      continue;
    }
    if (opts?.sumFields) {
      const merged: any = { ...existing };
      for (const f of opts.sumFields) {
        const a = Number(existing[f] ?? 0);
        const b = Number(row[f] ?? 0);
        if (Number.isFinite(a) && Number.isFinite(b)) merged[f] = a + b;
      }
      map.set(key, merged);
    }
  }
  return Array.from(map.values());
}