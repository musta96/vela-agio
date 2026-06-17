// Exchange session hours + holiday calendar for the market-status indicator.
// Times are in each exchange's local timezone. We compute "now in that TZ"
// using Intl.DateTimeFormat so DST shifts are handled automatically.

export type MarketId =
  | "XMIL" | "XETR" | "XPAR" | "XAMS" | "XLON" | "XMAD" | "XSWX"
  | "XNYS" | "XNAS" | "XTSE" | "XTKS" | "XHKG" | "XSHG" | "XASX";

export type MarketStatus = "open" | "closed" | "pre" | "post";

export type MarketInfo = {
  id: MarketId;
  label: string;       // "Milan"
  fullName: string;    // "Borsa Italiana"
  city: string;
  timezone: string;    // IANA tz
  openMin: number;     // minutes from local midnight, e.g. 9*60
  closeMin: number;
  holidays2026: string[]; // "MM-DD"
};

const COMMON_EU = ["01-01", "04-03", "04-06", "05-01", "12-24", "12-25", "12-26", "12-31"];

export const MARKETS: Record<MarketId, MarketInfo> = {
  XMIL: { id: "XMIL", label: "Milan", fullName: "Borsa Italiana", city: "Milan", timezone: "Europe/Rome", openMin: 9*60, closeMin: 17*60+30, holidays2026: [...COMMON_EU, "08-15"] },
  XETR: { id: "XETR", label: "Frankfurt", fullName: "Deutsche Börse Xetra", city: "Frankfurt", timezone: "Europe/Berlin", openMin: 9*60, closeMin: 17*60+30, holidays2026: COMMON_EU },
  XPAR: { id: "XPAR", label: "Paris", fullName: "Euronext Paris", city: "Paris", timezone: "Europe/Paris", openMin: 9*60, closeMin: 17*60+30, holidays2026: COMMON_EU },
  XAMS: { id: "XAMS", label: "Amsterdam", fullName: "Euronext Amsterdam", city: "Amsterdam", timezone: "Europe/Amsterdam", openMin: 9*60, closeMin: 17*60+30, holidays2026: COMMON_EU },
  XLON: { id: "XLON", label: "London", fullName: "London Stock Exchange", city: "London", timezone: "Europe/London", openMin: 8*60, closeMin: 16*60+30, holidays2026: ["01-01","04-03","04-06","05-04","05-25","08-31","12-25","12-28"] },
  XMAD: { id: "XMAD", label: "Madrid", fullName: "Bolsa de Madrid", city: "Madrid", timezone: "Europe/Madrid", openMin: 9*60, closeMin: 17*60+30, holidays2026: COMMON_EU },
  XSWX: { id: "XSWX", label: "Zurich", fullName: "SIX Swiss Exchange", city: "Zurich", timezone: "Europe/Zurich", openMin: 9*60, closeMin: 17*60+30, holidays2026: COMMON_EU },
  XNYS: { id: "XNYS", label: "New York", fullName: "NYSE", city: "New York", timezone: "America/New_York", openMin: 9*60+30, closeMin: 16*60, holidays2026: ["01-01","01-19","02-16","04-03","05-25","06-19","07-03","09-07","11-26","12-25"] },
  XNAS: { id: "XNAS", label: "Nasdaq", fullName: "Nasdaq", city: "New York", timezone: "America/New_York", openMin: 9*60+30, closeMin: 16*60, holidays2026: ["01-01","01-19","02-16","04-03","05-25","06-19","07-03","09-07","11-26","12-25"] },
  XTSE: { id: "XTSE", label: "Toronto", fullName: "Toronto Stock Exchange", city: "Toronto", timezone: "America/Toronto", openMin: 9*60+30, closeMin: 16*60, holidays2026: ["01-01","02-16","04-03","05-18","07-01","08-03","09-07","10-12","12-25","12-28"] },
  XTKS: { id: "XTKS", label: "Tokyo", fullName: "Tokyo Stock Exchange", city: "Tokyo", timezone: "Asia/Tokyo", openMin: 9*60, closeMin: 15*60, holidays2026: ["01-01","01-02","01-05","02-11","05-04","05-05"] },
  XHKG: { id: "XHKG", label: "Hong Kong", fullName: "HKEX", city: "Hong Kong", timezone: "Asia/Hong_Kong", openMin: 9*60+30, closeMin: 16*60, holidays2026: ["01-01","02-17","02-18","04-03","04-06","05-01","12-25"] },
  XSHG: { id: "XSHG", label: "Shanghai", fullName: "Shanghai Stock Exchange", city: "Shanghai", timezone: "Asia/Shanghai", openMin: 9*60+30, closeMin: 15*60, holidays2026: ["01-01","02-16","02-17","02-18","04-06","05-01","10-01","10-02"] },
  XASX: { id: "XASX", label: "Sydney", fullName: "Australian Securities Exchange", city: "Sydney", timezone: "Australia/Sydney", openMin: 10*60, closeMin: 16*60, holidays2026: ["01-01","01-26","04-03","04-06","04-25","06-08","12-25","12-28"] },
};

// Map a 2-letter country to a default market.
const COUNTRY_DEFAULT: Record<string, MarketId> = {
  IT: "XMIL", DE: "XETR", FR: "XPAR", NL: "XAMS", GB: "XLON", UK: "XLON",
  ES: "XMAD", CH: "XSWX", US: "XNYS", CA: "XTSE", JP: "XTKS", HK: "XHKG",
  CN: "XSHG", AU: "XASX",
};

export function defaultMarketForCountry(country?: string | null): MarketId {
  if (!country) return "XMIL";
  const m = COUNTRY_DEFAULT[country.toUpperCase()];
  return m ?? "XMIL";
}

// Returns a Date representing the wall clock in the given timezone.
function nowInTz(tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    mi: Number(get("minute")),
    weekday: get("weekday"), // "Mon"
  };
}

export function getMarketStatus(marketId: MarketId, at: Date = new Date()): {
  status: MarketStatus;
  label: string;          // "Open", "Closed - opens Mon 09:00 CET"
  short: string;          // "Open", "Closed"
  market: MarketInfo;
} {
  const m = MARKETS[marketId] ?? MARKETS.XMIL;
  const t = nowInTz(m.timezone);
  const mmdd = `${String(t.mo).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const minutes = t.h * 60 + t.mi;
  const isWeekend = t.weekday === "Sat" || t.weekday === "Sun";
  const isHoliday = m.holidays2026.includes(mmdd);

  if (isWeekend) {
    return { status: "closed", short: "Closed", label: `Closed - weekend`, market: m };
  }
  if (isHoliday) {
    return { status: "closed", short: "Closed", label: `Closed - holiday`, market: m };
  }
  if (minutes < m.openMin) {
    return { status: "pre", short: "Pre-open", label: `Pre-open - opens ${fmtTime(m.openMin)}`, market: m };
  }
  if (minutes >= m.closeMin) {
    return { status: "post", short: "After-hours", label: `Closed - opens tomorrow ${fmtTime(m.openMin)}`, market: m };
  }
  return { status: "open", short: "Open", label: `Open until ${fmtTime(m.closeMin)}`, market: m };
}

function fmtTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}