# Unify app look with landing page

Goal: bring the landing page's cinematic dark + glassmorphism language into the app, working at the **design-token layer** so every page picks it up automatically. Add a **user-controlled theme toggle** (dark default, light alt).

## 1. Audit current tokens
- Read `src/index.css`, `tailwind.config.ts`, `src/components/AppShell.tsx`, `MetricCard.tsx`, `PageHeader.tsx`, `AIBriefing.tsx`, `src/pages/Landing.tsx`, and `src/components/landing/*` to extract the landing palette, gradients, shadows, blur values, and border treatments already in use.

## 2. Rewrite the token layer (`src/index.css`)
Replace the current "mockup v2 cream sand" tokens with a **dual-theme system** keyed off `.dark` / `:root`:

- **Dark (default)** — base: deep navy `hsl(222 47% 6%)`, surfaces: translucent navy `hsl(222 47% 10% / 0.6)`, borders: `hsl(220 40% 30% / 0.4)`, foreground: near-white, primary: existing brand blue, accent gradients matching landing hero.
- **Light** — cream sand base preserved from v2 mockup system, but cards become frosted white with subtle navy tints + gradient borders so the language stays consistent.
- New semantic tokens: `--surface-glass`, `--surface-glass-strong`, `--border-glass`, `--gradient-hero`, `--gradient-accent`, `--shadow-glow`, `--shadow-elevated`, `--blur-glass`.
- Keep all existing token names (`--background`, `--card`, `--primary`, …) so no component needs rewriting.

## 3. Glass utility classes
Add a small set of reusable utilities in `index.css` `@layer components`:
- `.glass-card` — `bg-[hsl(var(--surface-glass))] backdrop-blur-[var(--blur-glass)] border border-[hsl(var(--border-glass))] shadow-[var(--shadow-elevated)]`
- `.glass-card-strong`, `.glass-panel`, `.gradient-hero`, `.gradient-border`
- `.glow-primary` for AI / accent surfaces

These mirror the classes already used on the landing page so the visual vocabulary is identical.

## 4. Tailwind config
- Extend `tailwind.config.ts` with the new semantic colors, `backdropBlur` values, and gradient/shadow utilities so they're available as Tailwind classes.
- No darkMode change needed — already `class`-based.

## 5. Theme toggle
- Add `src/hooks/useTheme.tsx` — reads/writes `localStorage("vela-theme")`, toggles `.dark` on `<html>`, defaults to `dark`, respects `prefers-color-scheme` on first load.
- Wire provider in `src/App.tsx`.
- Add a sun/moon toggle button in `src/components/TopNav.tsx` (or `AppShell` header) plus a row in `src/pages/Settings.tsx` ("Appearance: Dark / Light / System").

## 6. Targeted touch-ups for cohesion
Without rewriting components, nudge the most visible shared surfaces to use the new glass utilities:
- `AppShell` sidebar & topnav → `glass-panel` background
- `MetricCard` → `glass-card`
- `PageHeader` icon chip → gradient border + glow
- `AIBriefing` hero → reuse landing's `gradient-hero`

## 7. Verify
- Build check, then `browser--view_preview` on `/home`, `/portfolio`, `/settings` in both themes + mobile viewport to confirm tokens flow through and no contrast regressions.

## 8. Memory
Update `mem://design/mockup-system` to note it's now the **light theme** variant of a dual-theme system whose dark theme matches the landing page; add a new `mem://design/glass-system` describing the token set and utilities.

## Technical notes
- No business logic touched; only `index.css`, `tailwind.config.ts`, new `useTheme` hook, small additions to `App.tsx`, `TopNav.tsx`, `Settings.tsx`, and class swaps on 4 shared components.
- All existing pages keep working because semantic token names are preserved.
- Landing page itself unchanged — it already uses this language.