import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level audit: the Landing page header is heavy to render in jsdom
 * (supabase calls, GSAP, Three.js), so we verify the focus-visible and
 * tap-target contract by inspecting the JSX directly. This catches
 * regressions where someone removes the focus ring or shrinks a CTA.
 */
const SRC = readFileSync(resolve(process.cwd(), "src/pages/Landing.tsx"), "utf8");
const navStart = SRC.indexOf("{/* NAV */}");
const navEnd = SRC.indexOf("</header>");
const HEADER = navStart >= 0 && navEnd > navStart ? SRC.slice(navStart, navEnd) : "";

describe("Landing nav — focus & tap-target contract", () => {
  it("locates the header block in source", () => {
    expect(HEADER.length).toBeGreaterThan(0);
  });

  it("every header nav anchor has a focus-visible ring", () => {
    const navAnchors = HEADER.match(/<a href="#[a-z]+"[^>]*>/g) || [];
    expect(navAnchors.length).toBeGreaterThanOrEqual(4);
    for (const a of navAnchors) {
      expect(a).toMatch(/focus-visible:ring/);
    }
  });

  it("auth CTAs enforce 44px minimum height on mobile", () => {
    const headerButtons = HEADER.match(/<Button[^>]*size="sm"[^>]*>\s*<Link to="\/auth">/g) || [];
    expect(headerButtons.length).toBeGreaterThanOrEqual(2);
    for (const b of headerButtons) {
      expect(b).toMatch(/min-h-11/);
    }
  });
});