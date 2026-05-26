---
name: Mockup design system v2
description: Canonical visual language from the May 26, 2026 24-page mockup pack (vela-mockups). Replaces prior Bloomberg Terminal aesthetic for app pages.
type: design
---

## Foundation
- Background: cream sand `hsl(45 23% 93%)` (existing `--background`). NEVER use dark navy as page bg.
- Card surfaces: pure white `hsl(0 0% 100%)` with hairline border `hsl(211 76% 88%)`, radius `rounded-2xl`, subtle shadow only on raised actions.
- Sidebar: dark navy (kept, unchanged).
- Top bar (AppShell header): cream bg matching page (`bg-background`), bottom hairline border, NOT dark navy.
- Primary action color: `--primary` (Ocean blue). Buttons are pill-rounded with `rounded-lg`.
- Typography: Inter family (existing). Headings bold, tracking-tight. H1 = `text-3xl font-bold`.
- Positive = `text-success` / `bg-success/10`. Negative = `text-destructive`.

## Page header pattern
Square icon chip (10×10, bg-primary/10, rounded-lg) on the LEFT of an H1 bold black title. Subtitle line below in `text-muted-foreground text-sm`. Page actions sit on the right of the same row (Refresh, Export, Add account, Ask Coach, etc.).

## KPI strip pattern
A single white card with `rounded-2xl`, divided horizontally by `divide-x` into 4–5 cells. Each cell: tiny uppercase tracked label (`text-[11px] uppercase tracking-wider text-muted-foreground`), big bold number `text-2xl font-bold`, then a small delta line. NO individual KPI card boxes — it's one strip.

## Sidebar IA
- Markets: Dashboard · Macro · Watchlist · Screener · **Signals (with count badge)**
- My Wealth: Net Worth (collapsible, "new" badge) · Portfolio · Orders · Tax
- Lab: **Backtesting · Risk Engine · AI Assistant** (only these three; everything else moved to /more or deprecated from primary nav)

## Dashboard hero
The AI Market Briefing is rendered as a DARK NAVY contrast card (`bg-sidebar-background text-sidebar-foreground`) spanning the wide column. Right rail shows a "Today at a glance" white card with timed macro events.

## AI Assistant FAB
Solid blue circle (`bg-primary`), `h-14 w-14`, Sparkles icon (not Bot), fixed bottom-6 right-6. Opens docked chat panel.

## Disclaimer footer pill
Above the actual page bottom, render a pill: `inline-flex items-center gap-2 rounded-full bg-card border px-3 py-1.5 text-xs` with an info icon + "Vela.ai is an information tool, not a regulated advisor · Past performance does not guarantee future results." Then a thin row with `© 2026 Vela.ai · Made in Italy · Privacy · Terms · Disclaimer · Cookies`.

## Reference mockups (source of truth)
All 24 mockups live in the agent's /tmp workspace (not shipped to repo). Map:
01 Onboarding · 02 Dashboard · 03 Macro · 04 Watchlist · 05 Screener · 06 Signals · 07–17 Net Worth (overview + 10 categories) · 18 Portfolio · 19 Orders · 20 Tax Harvest · 21 Backtesting · 22 Risk Engine · 23 AI Assistant · 24 Settings.

When implementing any page, MATCH the mockup composition exactly: same hero alignment, same KPI strip cell count, same section ordering, same right-rail vs full-width treatment.