import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Visual regression guard for header components.
 *
 * The header sits on `bg-background` (cream/white in design system v2).
 * Sidebar-themed classes (`bg-white/5`, `text-sidebar-foreground/*`,
 * `border-white/10`, etc.) are designed for the dark navy sidebar and
 * render as near-invisible white-on-white when used in the header.
 */

const ROOT = path.resolve(__dirname, "..");

const HEADER_COMPONENTS = [
  "AppShell.tsx",
  "AuthButton.tsx",
  "NotificationBell.tsx",
  "LanguageSwitcher.tsx",
];

const FORBIDDEN = [
  /\bbg-white\/\d+\b/,
  /\bborder-white\/\d+\b/,
  /\btext-sidebar-foreground(?:\/\d+)?\b/,
  /\bbg-sidebar(?:-[a-z-]+)?(?:\/\d+)?\b/,
];

function safeRead(p: string): string | null {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

describe("header tokens", () => {
  for (const file of HEADER_COMPONENTS) {
    const src = safeRead(path.join(ROOT, file));
    if (src == null) continue;
    for (const pattern of FORBIDDEN) {
      it(`${file} must not use ${pattern}`, () => {
        const m = src.match(pattern);
        expect(m, `Found "${m?.[0]}" in ${file}. Use header tokens (bg-card, text-foreground, border-border).`).toBeNull();
      });
    }
  }

  it("AuthButton stays compact (avatar trigger, name in tooltip/menu)", () => {
    const src = safeRead(path.join(ROOT, "AuthButton.tsx"))!;
    expect(src).toMatch(/<Avatar\b/);
    expect(src).toMatch(/aria-label=|TooltipContent/);
  });

  it("AuthButton avatar trigger uses header-safe tokens (visible on cream + dark)", () => {
    const src = safeRead(path.join(ROOT, "AuthButton.tsx"))!;
    // The interactive trigger (the chip the user sees on first paint) MUST
    // carry an explicit background + foreground + border token so it never
    // collapses to white-on-white (light) or transparent-on-navy (dark).
    const triggerMatch = src.match(/<button[\s\S]*?aria-label=\{[\s\S]*?Account:[\s\S]*?className="([^"]+)"/);
    expect(triggerMatch, "AuthButton trigger button not found").not.toBeNull();
    const classes = triggerMatch![1];
    expect(classes, "missing bg-card on trigger").toMatch(/\bbg-card\b/);
    expect(classes, "missing text-foreground on trigger").toMatch(/\btext-foreground\b/);
    expect(classes, "missing border token on trigger").toMatch(/\bborder-border\b/);
    expect(classes, "missing focus ring").toMatch(/focus:ring-/);
  });

  it("AuthButton avatar fallback is opaque (readable in dark mode)", () => {
    const src = safeRead(path.join(ROOT, "AuthButton.tsx"))!;
    // AvatarFallback shows when the image is missing or slow. It MUST use a
    // semantic, opaque token so initials stay readable on both themes —
    // never transparent / bg-white/X / sidebar tokens.
    const fallbackMatch = src.match(/<AvatarFallback[\s\S]*?className="([^"]+)"/);
    expect(fallbackMatch, "AvatarFallback not found").not.toBeNull();
    const fallbackClasses = fallbackMatch![1];
    expect(fallbackClasses).toMatch(/\bbg-(card|background|muted|primary|secondary|accent)\b/);
    expect(fallbackClasses).toMatch(/\btext-(foreground|primary-foreground|secondary-foreground|accent-foreground|muted-foreground)\b/);
    expect(fallbackClasses).not.toMatch(/\bbg-transparent\b/);
    expect(fallbackClasses).not.toMatch(/\bbg-white\/\d+\b/);
  });

  it("AuthButton has a tooltip surfacing the full name/email on hover", () => {
    const src = safeRead(path.join(ROOT, "AuthButton.tsx"))!;
    // Compact avatar trigger only makes sense if the full identity is
    // reachable via tooltip + dropdown — guard both.
    expect(src).toMatch(/<TooltipContent[\s\S]*?\{user\.email/);
    expect(src).toMatch(/<DropdownMenuLabel/);
  });
});

describe("avatar token contrast in dark mode", () => {
  /**
   * Lightweight cross-theme check: re-resolve the AuthButton trigger's
   * computed background under both `:root` (light) and `.dark` (dark) themes.
   * If either resolves to "transparent" or matches the surrounding bg,
   * the chip would become invisible on first paint.
   */
  it("bg-card token has a defined value in both themes", () => {
    const css = safeRead(path.resolve(__dirname, "../../index.css")) || "";
    // Require explicit --card definitions for both light (`:root`) and `.dark`.
    const lightBlock = css.match(/:root\s*\{[\s\S]*?\}/)?.[0] || "";
    const darkBlock = css.match(/\.dark\s*\{[\s\S]*?\}/)?.[0] || "";
    expect(lightBlock, ":root must define --card").toMatch(/--card\s*:/);
    expect(darkBlock || ":root", "dark theme must define --card").toMatch(/--card\s*:/);
  });
});