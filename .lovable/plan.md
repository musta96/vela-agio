# First-Run Onboarding: One Path to First Value

## The core action

Vela's strongest, most demoable capability is **AI-driven stock research** — the AI Radar / "Ask Vela about a stock" flow. It's:
- Instant (no portfolio connection required)
- Universally understandable ("type a ticker → get an AI signal")
- The same primitive that powers Idea Lab, Signals, Sentiment, and Portfolio Coach later

So the single onboarding journey is: **"Get your first AI research signal on a stock you care about."**

Everything else (watchlist, backtesting, portfolio, net worth, goals) becomes a *next step* offered only after this first signal renders.

---

## Screen-by-screen flow

### Screen 1 — Welcome hero (0-5s)
Full-width takeover on `/dashboard` for users with `dashboard_tour_completed_at IS NULL`. Replaces (does not add to) the current dashboard grid until the user acts or dismisses.

```text
+------------------------------------------------------+
|                                                      |
|   Welcome to Vela.                                   |
|   Get an AI research signal on any stock in 10s.    |
|                                                      |
|   [ AAPL  |  TSLA  |  NVDA  |  Try your own ▸  ]    |
|                                                      |
|   Skip intro                                         |
+------------------------------------------------------+
```

- One sentence value prop. One row of 3 hot-start tickers + a search input.
- No nav distractions; sidebar stays but is visually dimmed.
- "Skip intro" writes `dashboard_tour_completed_at = now()` and reveals the full dashboard.

### Screen 2 — Signal reveal (5-20s)
The moment a ticker is picked/typed, we transition in-place to a focused single-card view (no route change, so it feels instant) showing the AI signal for that ticker:

```text
+------------------------------------------------------+
|  NVDA · NVIDIA Corp                    $ ---.--      |
|  ────────────────────────────────────────────────    |
|  Vela's take:  ● BULLISH  (confidence 72%)           |
|                                                      |
|  Why: 3 bullet reasons streamed from the AI          |
|   • ...                                              |
|   • ...                                              |
|   • ...                                              |
|                                                      |
|  [ Add to watchlist ]   [ Ask a follow-up ]          |
+------------------------------------------------------+
```

- Uses the existing signal/sentiment edge function; streams so first tokens appear <2s.
- The two CTAs are the *only* next steps offered here — chosen because each opens exactly one secondary feature (Watchlist, Assistant) without leaving the flow.

### Screen 3 — "You're set" handoff (20-30s)
After the user clicks either CTA (or dismisses the card), we mark the tour complete and reveal the full dashboard with a single subtle toast + a persistent, dismissible "Next steps" strip at the top of the dashboard:

```text
Toast:  ✓ First signal saved. Explore more anytime from Research → AI Radar.

Strip (dismissible, one row, muted):
  Next: [Track a portfolio]  [Set an alert]  [Run a backtest]  ✕
```

- The strip is the *only* place secondary features are surfaced upfront. It disappears on dismiss and never returns.
- All deeper features (backtesting, net worth, tax, goals, etc.) remain discoverable via the sidebar but are never pushed.

---

## Success criteria (the 30-second test)

A brand-new user lands on `/dashboard`, sees one sentence + 3 tickers, clicks one, and reads their first AI signal — all within 30 seconds, zero navigation, zero forms.

---

## Technical notes

- **Trigger:** reuse the existing `profiles.dashboard_tour_completed_at` flag. If null → render `<FirstRunJourney />` instead of the dashboard grid. The existing `DashboardTour` (3-step highlight walkthrough) is retired in favor of this focused flow.
- **New component:** `src/components/onboarding/FirstRunJourney.tsx` — controls the 3 in-place screens via a local `step` state ("welcome" | "signal" | "done"). No new routes.
- **Signal fetch:** call the existing AI signal / sentiment edge function with the chosen ticker; stream via the same hook Idea Lab uses. No new backend.
- **Persistence:** on either CTA click or "Skip intro", update `profiles.dashboard_tour_completed_at` via Supabase (already wired) and set `localStorage.vela.firstRun.done = "1"` for instant re-render across tabs.
- **Next-steps strip:** new `src/components/dashboard/NextStepsStrip.tsx`, rendered on `/dashboard` only when `dashboard_tour_completed_at` is within the last 24h AND `localStorage.vela.nextSteps.dismissed !== "1"`. Three links: `/portfolio`, `/alerts`, `/backtest`.
- **Files removed/edited:**
  - Edit `src/pages/Index.tsx` — gate on the flag, render `<FirstRunJourney />` or dashboard grid.
  - Retire `src/components/dashboard/DashboardTour.tsx` (keep file but stop mounting it).
  - Keep `FirstRunHero.tsx` only if the user wants it as a fallback empty state; otherwise delete.
- **Accessibility:** focus trap on the welcome screen, autofocus the ticker input, ESC = "Skip intro", `aria-live="polite"` on the streaming signal reasons.
- **Analytics:** emit `onboarding_start`, `onboarding_ticker_chosen`, `onboarding_signal_rendered`, `onboarding_cta_watchlist|assistant`, `onboarding_skipped`, `onboarding_complete` via the existing telemetry helper.

---

## Open questions before I build

1. Confirm the core action is **AI signal on a stock** (vs. "Connect a portfolio" or "Ask the Assistant a question"). If you'd rather lead with the Assistant chat, screen 2 becomes a chat bubble instead of a signal card.
2. For the 3 hot-start tickers, OK with `AAPL / TSLA / NVDA`, or prefer a rotating "today's most-scanned" list?
3. Should "Skip intro" also mark `dashboard_tour_completed_at`, or only dismiss for this session so it reappears next login?
