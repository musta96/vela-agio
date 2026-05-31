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
});