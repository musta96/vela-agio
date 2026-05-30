# Fixes across 3 phases

Each phase ships independently so we can pause/redirect between turns. I'll deliver them in order.

## Phase 1 — Privacy gate + Settings tabs + Connectors UI

### 1a. Owner console privacy (advisory consent gate)
New table `advisory_consents` (user grants explicit mandate to a specific admin):

```text
advisory_consents
  id            uuid pk
  user_id       uuid  -- the client
  granted_to    uuid  -- the admin/advisor user_id
  scope         text  -- 'portfolio_read' | 'net_worth_read'
  granted_at    timestamptz
  revoked_at    timestamptz nullable
  mandate_ref   text  -- free-text reference to signed mandate
```

RLS:
- User can SELECT/INSERT/UPDATE (revoke) their own rows.
- Admin can SELECT rows where `granted_to = auth.uid()`.

Security-definer helper `public.has_advisory_consent(client_uuid, admin_uuid, scope)`.

`src/pages/owner/UserProfile.tsx`:
- Replace any portfolio/net-worth/positions block with a **gated panel**. If no active consent → show lock card with "Request advisory mandate" button (no data, no counts of holdings).
- If consent active → render the existing details.
- Always-visible (no consent needed): plan, billing status, last login, audit, support actions, GDPR.

User-side: small "Advisory access" section in Settings → Privacy & data listing any active mandates with a Revoke button.

### 1b. Settings tabs actually work
`src/pages/Settings.tsx` is currently a tab list with a single right column that ignores `tab` (except Billing). Rebuild as a switch:
- **Profile** — display name, avatar, phone, bio, DoB → writes to `profiles`.
- **Fiscal residency** — existing card, wired to `profiles.country_residence` / `country_tax_residence`.
- **Currencies** — base currency selector (persist to profiles).
- **Broker connections** — existing brokers table.
- **Notifications** — surface `alert_preferences` toggles (email, daily digest, digest hour, critical-only).
- **Privacy & data** — link to `/privacy-settings`, list active advisory mandates, GDPR export/delete.
- **Billing** — current card.

### 1c. Restore external integrations UI
Re-add a **Connections** card (under Profile or its own tab "Integrations"):
- AI provider override (Lovable default, OpenAI, Anthropic) → `profiles.ai_provider` + `profiles.ai_model`.
- BYO API keys for OpenAI / Anthropic / Seeking Alpha / Morningstar / FMP — encrypted via existing `user_api_keys` table and `keys-vault` edge function.

## Phase 2 — Market clock + dashboard math

### 2a. Market-status banner
- Add `profiles.preferred_market` (default inferred from `country_residence`: IT → XMIL, US → XNYS, GB → XLON, FR → XPAR, DE → XETR).
- New `src/lib/marketHours.ts` with per-exchange session windows in local TZ + a static 2026 holiday list (Italian + US majors at minimum).
- `MarketRegimeBanner` reads preferred market, computes status against current `Europe/Rome` (or selected) time, and shows **CLOSED** on Sat/Sun + holidays + outside cash session. Display the exchange name (Borsa Italiana / NYSE / etc.).

### 2b. Net Worth allocation total
Audit dashboard allocation widget vs `/net-worth` headline. Likely cause: allocation excludes liabilities OR FX-converts inconsistently. Fix to use the same selector/aggregator used by `NetWorth.tsx` (filter by `include_in_total`, apply same FX, subtract liabilities exactly once).

## Phase 3 — Catalog + MIFID + Owner plans

### 3a. Expand ticker catalog
Add missing FTSE MIB constituents to `src/data/stockCatalog.ts` (Unipol UNI.MI, plus a sweep of the index members not already present). I'll keep symbol, name, exchange, sector, currency.

### 3b. MIFID suitability questionnaire
`src/pages/Suitability.tsx` already exists and writes to `investor_profiles`. Restore entry points:
- Sidebar link "Suitability (MIFID)" under Profile/Settings group.
- Settings → Profile shows MIFID status (Completed YYYY-MM-DD / Not started) with CTA.
- Onboarding checklist adds a MIFID step.

### 3c. Owner console: plan management
New `src/pages/owner/PlansEditor.tsx` (extends existing `Plans.tsx`):
- List all Stripe products/prices fetched from a new `list-plans` edge function (uses `stripe.products.list` + `stripe.prices.list`).
- "New plan" form → calls a new `manage-plan` edge function which uses `stripe.products.create` + `stripe.prices.create` (admin-gated via `has_role('admin')`).
- Edit name/description (update product); archive plan (set `active=false`); create new price for a plan.
- Prices remain immutable (Stripe convention) — UI explains "create a new price" rather than editing amount.

## What I will NOT change

- Stripe checkout flow already shipped.
- Existing `subscriptions` table.
- Design system (cream/navy mockup v2 stays).
- Auth flow.

## Order of delivery

Turn 1 (next): Phase 1 — migration for `advisory_consents`, owner profile gate, Settings rebuild, connections card.
Turn 2: Phase 2 — market clock + net worth math.
Turn 3: Phase 3 — catalog + MIFID entry + Owner plans editor.

Approve to start Phase 1, or tell me to reorder.
