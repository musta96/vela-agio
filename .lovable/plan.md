
## The core action

Vela's strongest, most immediate capability is **AI stock signals** — no data entry required, works in one tap, returns a real analysis. Everything else (portfolio, watchlist, backtest, alerts) is more valuable *after* a user has seen a signal.

So the journey is: **land → see a real signal in ≤30s → convert that moment into a personalised next step.**

Good news: `FirstRunJourney` + `NextStepsStrip` already scaffold this. The plan tightens it into one clear path, removes friction points, and controls what shows up second.

---

## Screen-by-screen flow

### Screen 1 — Welcome + auto-signal (0-5s)

Replaces the current "welcome / signal" two-step with a single card that starts working the moment it mounts.

```text
┌──────────────────────────────────────────────────────────┐
│  Welcome to Vela, Ana.                                   │
│  Let's start with what Vela does best — an AI signal.    │
│                                                          │
│  🔍  Analysing AAPL…  ●●●                                │
│                                                          │
│  Or try another:  [NVDA] [TSLA] [MSFT] [+ type a ticker] │
│                                                          │
│                                        Skip intro (Esc)  │
└──────────────────────────────────────────────────────────┘
```

- One card, one focus. Auto-starts on today's top hot ticker (already wired).
- Three hot chips + a ticker input for anyone who wants their own stock.
- Skippable with ESC or link — never trapping.

### Screen 2 — The signal (5-15s)

Same card morphs into the actual result. This IS the "aha" moment — a real analysis, not a demo.

```text
┌──────────────────────────────────────────────────────────┐
│  AAPL  ·  Apple Inc.                                     │
│                                                          │
│  ┌──────┐   Vela Signal: BULLISH  ▲ 72                   │
│  │  72  │   Strong momentum, above 50-DMA, positive      │
│  └──────┘   earnings revisions this week.                │
│                                                          │
│  Drivers                                                 │
│   ▲ Q4 revenue beat                                      │
│   ▲ Services margin expansion                            │
│   ▼ China smartphone demand softening                    │
│                                                          │
│  [ See full research on AAPL → ]                         │
│  Try another ticker · Skip                               │
└──────────────────────────────────────────────────────────┘
```

- Primary CTA opens `/stock/AAPL` (full research).
- Secondary link "Try another ticker" cycles them back to Screen 1 input, so nothing feels one-shot.
- Marks first-run complete in `profiles.first_run_completed_at` on the primary CTA click (already wired).

### Screen 3 — Contextual next steps (post-first-signal)

Once the user comes back to `/dashboard`, replace the current generic strip with a **single Vela-voice recommendation** tuned to what they just did, plus 3 quiet secondary chips.

```text
Next for AAPL:
   You've seen the signal. Here's what usually comes next.

   ┌─ Primary suggestion ─────────────────────────────────┐
   │  📈 Add AAPL to a watchlist so Vela pings you        │
   │      when the signal flips.        [ Add & watch → ] │
   └──────────────────────────────────────────────────────┘

   Also: [ Compare AAPL vs peers ]  [ Backtest AAPL ]  [ Get another signal ]
                                                          × dismiss
```

Dismissible; auto-hides after any chip is clicked or after 7 days.

### Screen 4 — Quiet secondary discovery (ongoing)

After the user has (a) completed first run AND (b) either clicked one next-step OR dismissed the strip, we surface features in-context, never as a wall:

- After the 2nd signal → small inline card on the signal result: *"You've run 2 signals. Save your favourites to a watchlist so they're one tap away."*
- After the first watchlist item → subtle banner on `/watchlist`: *"Turn this into a portfolio to see live P/L."*
- After first portfolio holding → subtle banner on `/portfolio`: *"Run a stress test on this position."*

These are individual `ProgressiveHint` cards keyed to a single trigger + dismissed-once state. No global checklist, no modal, no wizard.

---

## What changes in code

1. **`FirstRunJourney`** — collapse `welcome` + `signal` into one always-active step; the ticker input becomes an inline "Or try another" strip inside the same card instead of a separate screen. Remove the `Step` state.
2. **`NextStepsStrip`** → **`ContextualNextStep`** — same file, redesigned per Screen 3: one primary suggestion + secondary chips, Vela-voice copy, symbol-aware.
3. **New `ProgressiveHint` component** — small inline card, keyed by `hintKey`, dismissed via localStorage, used at 3 trigger points (StockDetails after 2 signals, Watchlist first item, Portfolio first holding).
4. **New tiny hook `useUsageMilestones`** — counts events from `ai_event_log` (already logged) so hints trigger reliably: `signals_run`, `watchlist_count`, `portfolio_count`.
5. **`Index.tsx`** — swap `NextStepsStrip` for `ContextualNextStep`, keep the rest of the dashboard hidden during `isFirstRun` (already the behaviour).
6. **Remove the old `OnboardingChecklist`** from wherever it still mounts — it competes with this journey. (Confirm before deleting the file.)

## Success test

- New account → land on `/dashboard` → Screen 1 renders and starts fetching AAPL within 300ms → Screen 2 result visible within ~5-10s (edge fn budget) → user can click "See full research" for their first meaningful action **inside 15-30s**, no typing required.
- Analytics events already in place (`onboarding_start`, `onboarding_auto_default`, `onboarding_complete`, plus new `onboarding_next_step_click`) let us measure the 30s target.

## Not in scope

- No product tour overlay (Shepherd/Intro.js style) — those explain UI instead of delivering value.
- No connect-broker or portfolio-import step in first run — too much friction; kept as a secondary suggestion.
- No paywall or upgrade prompt anywhere in the first-run flow (matches the "generous by default" stance from prior work).

Approve and I'll implement in one pass: journey refactor, next-step redesign, progressive hints, and the milestones hook.
