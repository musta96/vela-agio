## Free-only, production-grade roadmap

Constraint: no paid data vendors, no paid infra. Everything uses Lovable Cloud (already enabled), Lovable AI Gateway (already included), free public data sources, and free OSS libs. Where a paid feed would normally be used, we substitute the best free equivalent and document the limitation.

Done in 6 phases, smallest-blast-radius first. I'll execute Phase 1 immediately on approval, then pause for review before each next phase.

---

### Phase 1 — Security foundation (ship first)
The single biggest blocker to "fund-ready". All code, no new infra.

1. **Move API keys out of `localStorage`** into an encrypted per-user table in Lovable Cloud.
   - New table `user_api_keys (user_id, provider, ciphertext, iv, created_at)` with strict RLS (owner-only).
   - Encryption at rest using a server-side `APP_ENCRYPTION_KEY` (pgcrypto `pgp_sym_encrypt`).
   - New edge function `keys-vault` (get/set/delete) — keys never returned to the browser in plaintext; AI/data calls that need them run server-side.
   - `Settings.tsx` rewritten to call the vault; old `userApiKeys.ts` localStorage path removed.
2. **Roles & RBAC**: `app_role` enum (`viewer`, `analyst`, `pm`, `admin`), `user_roles` table, `has_role()` security-definer function, RLS hooks on sensitive tables. UI gates admin/PM-only pages.
3. **Audit log**: append-only `audit_log` table (actor, action, entity, payload_hash, ts). Edge functions write to it on every order, AI pick, key change, role change. Admin-only viewer page.
4. **Auth hardening**: enable HIBP leaked-password check, require email confirm, add a Settings → Security panel with "sign out everywhere".
5. **Security headers** on edge functions (CSP-friendly responses, strict CORS allowlist instead of `*` for sensitive routes).

### Phase 2 — Data layer (free sources, but reliable)
6. **Edge-function proxy** for all market data — replaces `allorigins.win` (which is fragile + ToS-grey).
   - `market-data` edge function calls Yahoo Finance + Stooq (free, no key) directly server-side (no CORS issue).
   - Adds retry, timeout, in-memory LRU + Postgres cache, structured errors.
7. **Historical cache** in Postgres: `ohlcv_daily(symbol, date, o,h,l,c,v, adj_close)` populated on demand, reused by backtests. Eliminates per-run external dependency and gives **corporate-action-adjusted** series (Yahoo's `adjclose`).
8. **Corporate-actions & FX**: store splits/dividends from Yahoo's `events` payload; fetch ECB daily reference rates (free) for FX normalization.
9. **Point-in-time fundamentals snapshot table** (best-effort from Yahoo's quoteSummary, stamped with retrieval date) to prevent look-ahead bias in backtests.

### Phase 3 — Quant engine upgrade
10. **Backtester v2** (TypeScript in edge function): slippage model, commission model, borrow cost flag, position sizing (fixed-fractional, vol-target, Kelly-capped), benchmark comparison.
11. **Risk metrics**: Sortino, Calmar, rolling Sharpe, max-DD duration, historical VaR/CVaR, beta vs benchmark, turnover, hit-rate.
12. **Walk-forward + Monte Carlo** (bootstrap resampling of returns) for robustness reports.
13. **Portfolio analytics page**: factor-ish exposures (sector/country/size via free metadata), correlation matrix, HHI concentration, marginal contribution to risk.

### Phase 4 — Sentiment & research, hardened
14. **Bot/spam filters** on Reddit/X (account age, karma threshold, dedupe by content hash).
15. **Source-trust weighting** in the AI prompt (Reuters/Yahoo > SeekingAlpha > Reddit > anon X).
16. **Italian-language sentiment** for FTSE MIB (Lovable AI is multilingual — add `lang` hint).
17. **Free filings ingestion**: SEC EDGAR (US, free API) + CONSOB OAM RSS (Italy). New `filings` source feeding the same sentiment pipeline.
18. **AI-pick tracking**: persist every Smart Pick with timestamp + entry price; nightly job marks forward returns → live hit-rate dashboard. Builds real track record.

### Phase 5 — Reliability & ops (free tier)
19. **Structured logging** in every edge function (JSON, correlation id) + a Logs admin page reading `function_edge_logs`.
20. **Scheduled jobs** via `pg_cron` (Lovable Cloud Postgres) for: daily OHLCV refresh, sentiment re-poll, AI-pick forward-return update, audit-log retention.
21. **Health page** (`/admin/health`) showing DB status, last cron run, queue depth, last successful data refresh per source.
22. **Client-side error reporter** that POSTs to an edge function → `client_errors` table (homegrown free Sentry).
23. **Rate limiting** on public-ish edge functions (token bucket in Postgres).

### Phase 6 — Pro UX & API
24. **Realtime quotes via Supabase Realtime** (replace 30s polling on watched symbols).
25. **Command palette (⌘K)**, keyboard shortcuts, density toggle (Bloomberg-style compact mode).
26. **CSV/Excel export** on every table (already partial on backtests — extend).
27. **Read-only REST API** (edge function with API-key auth, scoped via `user_api_keys`) so users can pull their watchlist/picks into notebooks.
28. **Saved screens & alert sync** (already have alerts — move from localStorage to DB so they fire even when the tab is closed, via cron).
29. **Legal page**: ToS, "not investment advice", data-source attributions (Yahoo/Stooq/EDGAR/ECB), GDPR contact.

---

### Free-source map (so expectations are clear)
| Need | Free source we'll use | Limitation vs paid |
|---|---|---|
| EOD + intraday quotes | Yahoo Finance, Stooq | ~15-min delay, no SLA |
| Fundamentals | Yahoo quoteSummary | Best-effort, no point-in-time guarantee |
| FX | ECB reference rates | Daily, EUR-centric |
| US filings | SEC EDGAR | Official, free |
| EU filings | CONSOB OAM, AMF, BaFin RSS | Coverage varies |
| News | Yahoo RSS, SeekingAlpha RSS, Reddit JSON, Nitter (X) | Already wired; will add bot filters + trust weights |
| LLM | Lovable AI Gateway (Gemini default) | Already free within workspace credits |

---

### What I'll do right now if you approve
Execute **Phase 1 only** (security foundation): migrations for `user_api_keys`, `user_roles`, `audit_log`; the `keys-vault` edge function; rewritten Settings page; HIBP + email-confirm auth config; admin audit-log viewer. Then I stop and we review before Phase 2.

### Out of scope (intentionally)
- Paid market-data feeds, paid brokers, paid observability (Sentry/Datadog), TimescaleDB/ClickHouse, FIX gateway, SOC 2 audit. We document why and what would change if you ever upgrade.
