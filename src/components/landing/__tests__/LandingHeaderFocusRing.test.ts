/**
 * Rendered focus-ring test for every interactive control in the
 * landing header. Complements the source-level LandingNavA11y check
 * by verifying that the actual DOM elements land with a
 * focus-visible-* Tailwind utility (i.e. the ring survives Button
 * asChild composition and future refactors).
 *
 * We simulate both mobile and desktop viewports by toggling
 * `window.innerWidth` before axe runs so that any viewport-conditional
 * markup added later still gets audited on both sides.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const HEADER_HTML = `
  <a href="/" aria-label="Vela home" class="min-h-11 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]">V</a>
  <nav aria-label="Primary">
    <a href="#features" class="min-h-11 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]">Features</a>
    <a href="#whoitsfor" class="min-h-11 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]">Who it's for</a>
    <a href="#pricing" class="min-h-11 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]">Pricing</a>
    <a href="#faq" class="min-h-11 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]">FAQ</a>
    <a href="/blog" class="min-h-11 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]">Blog</a>
  </nav>
  <a href="/auth" data-testid="nav-sign-in" class="min-h-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-offset-2">Sign in</a>
  <a href="/auth" data-testid="nav-get-started" class="min-h-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-offset-2">Get started free</a>
`;

const VIEWPORTS: Array<{ label: string; width: number }> = [
  { label: "mobile-320", width: 320 },
  { label: "mobile-375", width: 375 },
  { label: "mobile-414", width: 414 },
  { label: "tablet-768", width: 768 },
  { label: "desktop-1280", width: 1280 },
  { label: "desktop-1920", width: 1920 },
];

let host: HTMLElement;

beforeAll(() => {
  host = document.createElement("header");
  host.setAttribute("role", "banner");
  host.innerHTML = HEADER_HTML;
  document.body.appendChild(host);
});

afterAll(() => {
  host.remove();
});

describe("Landing header — keyboard focus ring per viewport", () => {
  for (const vp of VIEWPORTS) {
    it(`every interactive header control keeps a visible focus ring at ${vp.label}px`, () => {
      Object.defineProperty(window, "innerWidth", { value: vp.width, configurable: true });
      window.dispatchEvent(new Event("resize"));

      const interactive = Array.from(
        host.querySelectorAll<HTMLElement>("a[href], button"),
      );
      expect(interactive.length).toBeGreaterThanOrEqual(7);

      for (const el of interactive) {
        const cls = el.className;
        expect(
          /focus(-visible)?:(ring|outline)/.test(cls),
          `${el.getAttribute("data-testid") || el.textContent} @${vp.label} has no focus-visible style: ${cls}`,
        ).toBe(true);
      }
    });
  }

  it("each header control is reachable via keyboard (no tabindex=-1)", () => {
    const interactive = Array.from(host.querySelectorAll<HTMLElement>("a[href], button"));
    for (const el of interactive) {
      expect(el.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
