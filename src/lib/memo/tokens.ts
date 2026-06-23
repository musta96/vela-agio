/**
 * Vela memo design tokens (frozen). Single source of truth for all PDF styling.
 * Components MUST reference these values rather than hardcoding hex / sizes.
 */
export const tokens = {
  color: {
    ink: "#0A0E14",
    navy: "#0B2447",
    navyDeep: "#0A1F3A",
    ocean: "#1E5B8C",
    steel: "#5A7896",
    muted: "#6B7280",
    line: "#D8DEE6",
    line2: "#EAEEF3",
    panel: "#F4F7FA",
    white: "#FFFFFF",
    positive: "#1A7D54",
    positiveBg: "#E6F4EC",
    negative: "#B4282A",
    negativeBg: "#FBEBEB",
    amber: "#B07A12",
    amberBg: "#FBF2DF",
    gold: "#A67C00",
    teal: "#0F6E56",
    coverTitle: "#FFFFFF",
    coverSub: "#B8C6D6",
    coverKicker: "#5DCAA5",
    coverAccent: "#7FB2D9",
    coverFoot: "#5A728F",
    corr: ["#E0EFE6", "#FBF2DF", "#FAE3C9", "#F3C9C4", "#E59A93"],
  },
  font: {
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    mono: "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
    serif: "'Georgia', serif",
  },
  size: {
    coverTitle: 30,
    coverSub: 11,
    h1: 15,
    sec: 11,
    sub: 9,
    body: 8.7,
    small: 7.6,
    label: 6.6,
    th: 7.2,
    td: 7.8,
    tickerLg: 12,
  },
  leading: { body: 13.2, small: 10.5, tight: 9 },
  tracking: { label: 1.4 },
  space: { xs: 3, sm: 5, md: 8, lg: 10, xl: 14, section: 18 },
  page: {
    size: "A4",
    marginTop: 20,
    marginBottom: 18,
    marginLeft: 20,
    marginRight: 20,
    headerY: 13,
    footerY: 11,
  },
  table: {
    headerFill: "#0B2447",
    headerText: "#FFFFFF",
    rowAltFill: "#F4F7FA",
    rowSep: "#EAEEF3",
    outerBox: "#D8DEE6",
    cellPadX: 7,
    cellPadY: 4.5,
    accentRowAbove: "#1E5B8C",
  },
  rule: { hairline: 0.5, accent: 1.0, disclosureLeft: 2.5 },
  radius: { none: 0, sm: 3 },
  logo: {
    mainSail: "#1E5B8C",
    accentSail: "#0F6E56",
    hull: "#9CC3E0",
  },
} as const;

export type Tokens = typeof tokens;

/** Flat allowlist of every hex literal we expose, used by the snapshot test. */
export const TOKEN_HEX_VALUES: ReadonlySet<string> = new Set(
  [
    ...Object.values(tokens.color).flatMap((v) => (Array.isArray(v) ? v : [v])),
    tokens.table.headerFill,
    tokens.table.headerText,
    tokens.table.rowAltFill,
    tokens.table.rowSep,
    tokens.table.outerBox,
    tokens.table.accentRowAbove,
    tokens.logo.mainSail,
    tokens.logo.accentSail,
    tokens.logo.hull,
  ].map((s) => String(s).toUpperCase()),
);