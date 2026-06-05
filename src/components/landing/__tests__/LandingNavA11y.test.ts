import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level audit: the Landing page header is heavy to render in jsdom
 * (supabase calls, GSAP, Three.js), so we verify the focus-visible and
 * tap-target contract by inspecting the JSX directly. This catches
 * regressions where someone removes the focus ring or shrinks a CTA.
 */
const SRC = readFileSync(resolve(__dirname, "../../../pages/Landing.tsx"), "utf8");

describe("Landing nav — focus & tap-target contract", () => {
  it("every header nav anchor has a focus-visible ring", () => {
    const navAnchors = SRC.match(/<a href="#[a-z]+"[^>]*>/g) || [];
    expect(navAnchors.length).toBeGreaterThanOrEqual(4);
    for (const a of navAnchors) {
      expect(a).toMatch(/focus-visible:ring/);
    }
  });

  it("auth CTAs enforce 44px minimum height on mobile", () => {
    // Sign in + Get started buttons in the header.
    const headerButtons = SRC.match(/<Button[^>]*size="sm"[^>]*>\s*<Link to="\/auth">/g) || [];
    expect(headerButtons.length).toBeGreaterThanOrEqual(2);
    for (const b of headerButtons) {
      expect(b).toMatch(/min-h-11/);
    }
  });
});