---
name: Glass design system (app-wide)
description: Dual-theme dark/light system with glassmorphism tokens that aligns app aesthetic with the landing page. Default is dark.
type: design
---
The app uses a dual-theme glass system that unifies the app with the landing page.

- Default theme: **dark** (matches landing cinematic navy). Light theme = cream/sand from mockup v2.
- Toggle: `useTheme()` hook in `src/hooks/useTheme.tsx`; UI via `ThemeToggle` in topnav and a Light/Dark/System segmented control on Settings.
- LocalStorage key: `vela-theme`.

Semantic tokens added to `src/index.css` (both themes):
`--surface-glass`, `--surface-glass-strong`, `--surface-glass-soft`, `--border-glass`, `--border-glass-strong`, `--blur-glass`, `--gradient-hero`, `--gradient-accent`, `--gradient-border`, `--shadow-elevated`, `--shadow-glass`, `--glow-primary`.

Utility classes (in `@layer components`):
`.glass-card`, `.glass-card-strong`, `.glass-panel`, `.gradient-hero`, `.gradient-accent`, `.gradient-border`, `.glow-primary`.

Rules:
- Never hard-code colors in components. Use tokens or these utilities.
- The body background uses `var(--gradient-hero)` in dark mode (radial accents) and falls back to `--background` in light.
- All existing shadcn token names (`--background`, `--card`, `--primary`, etc.) are preserved so no per-page rewrites are needed.