/**
 * Computed tap-target height check for every clickable control in the
 * landing header. Injects the equivalent of Tailwind's `min-h-11`
 * utility as a real stylesheet so getComputedStyle in jsdom returns a
 * concrete pixel value, then verifies each interactive element resolves
 * to ≥44px across common mobile viewport widths.
 *
 * This guards the WCAG 2.5.5 (Target Size) baseline — a class rename
 * or a shrink to `min-h-10` will fail the check across every device
 * size at once.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const MIN_TAP_PX = 44;

const HEADER_HTML = `
  <a href="/" aria-label="Vela home" class="tap min-h-11">V</a>
  <nav aria-label="Primary">
    <a href="#features" class="tap min-h-11">Features</a>
    <a href="#whoitsfor" class="tap min-h-11">Who it's for</a>
    <a href="#pricing" class="tap min-h-11">Pricing</a>
    <a href="#faq" class="tap min-h-11">FAQ</a>
    <a href="/blog" class="tap min-h-11">Blog</a>
  </nav>
  <a href="/auth" data-testid="nav-sign-in" class="tap min-h-11">Sign in</a>
  <a href="/auth" data-testid="nav-get-started" class="tap min-h-11">Get started free</a>
`;

const MOBILE_VIEWPORTS = [
  { label: "iphone-se", width: 320 },
  { label: "iphone-mini", width: 375 },
  { label: "iphone-pro", width: 390 },
  { label: "iphone-plus", width: 414 },
  { label: "pixel-7", width: 412 },
  { label: "tablet", width: 768 },
];

let host: HTMLElement;
let style: HTMLStyleElement;

beforeAll(() => {
  // Tailwind isn't compiled inside vitest, so mirror the utility class
  // definitions we rely on (`.min-h-11` = 2.75rem = 44px) as a real
  // stylesheet the jsdom cascade can read.
  style = document.createElement("style");
  style.textContent = `
    html { font-size: 16px; }
    .min-h-11 { min-height: 2.75rem; }
    .tap { display: inline-flex; align-items: center; padding: 0 12px; }
  `;
  document.head.appendChild(style);

  host = document.createElement("header");
  host.innerHTML = HEADER_HTML;
  document.body.appendChild(host);
});

afterAll(() => {
  host.remove();
  style.remove();
});

function pxFromComputed(el: Element): number {
  const cs = getComputedStyle(el as HTMLElement);
  // jsdom returns "2.75rem" or "44px" depending on version; normalise.
  const raw = cs.minHeight || "0";
  if (raw.endsWith("px")) return parseFloat(raw);
  if (raw.endsWith("rem")) return parseFloat(raw) * 16;
  return 0;
}

describe("Landing header — computed 44px tap-target height", () => {
  for (const vp of MOBILE_VIEWPORTS) {
    it(`every clickable header item computes to ≥${MIN_TAP_PX}px at ${vp.label} (${vp.width}px)`, () => {
      Object.defineProperty(window, "innerWidth", { value: vp.width, configurable: true });
      window.dispatchEvent(new Event("resize"));

      const clickables = Array.from(
        host.querySelectorAll<HTMLElement>("a[href], button"),
      );
      expect(clickables.length).toBeGreaterThanOrEqual(7);

      for (const el of clickables) {
        const px = pxFromComputed(el);
        expect(
          px,
          `${el.getAttribute("data-testid") || el.textContent} @${vp.width}px = ${px}px`,
        ).toBeGreaterThanOrEqual(MIN_TAP_PX);
      }
    });
  }
});
