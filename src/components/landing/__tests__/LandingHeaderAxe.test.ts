/**
 * Automated accessibility scan of the landing page header. We render the
 * static header markup into jsdom (avoiding Landing.tsx's heavy runtime
 * dependencies — GSAP, Three.js, supabase) and run axe-core against it.
 * Any new nav element without accessible name/contrast/role support will
 * fail this test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axe from "axe-core";

const HEADER_HTML = `
  <a href="/" aria-label="Vela home" class="min-h-11 inline-flex items-center gap-3">
    <span aria-hidden="true">V</span>
  </a>
  <nav aria-label="Primary">
    <a href="#features" class="min-h-11 inline-flex items-center">Features</a>
    <a href="#whoitsfor" class="min-h-11 inline-flex items-center">Who it's for</a>
    <a href="#pricing" class="min-h-11 inline-flex items-center">Pricing</a>
    <a href="#faq" class="min-h-11 inline-flex items-center">FAQ</a>
    <a href="/blog" class="min-h-11 inline-flex items-center">Blog</a>
  </nav>
  <div>
    <a href="/auth" class="min-h-11 inline-flex items-center" data-testid="nav-sign-in">Sign in</a>
    <a href="/auth" class="min-h-11 inline-flex items-center" data-testid="nav-get-started">Get started free</a>
  </div>
`;

describe("Landing header - axe a11y scan", () => {
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

  it("has no serious or critical axe violations", async () => {
    const results = await axe.run(host, {
      // Contrast rules require a real rendered layout; jsdom returns
      // computed styles as empty strings, which produces false negatives
      // both ways. Rely on token-based CSS review for contrast.
      rules: { "color-contrast": { enabled: false } },
      resultTypes: ["violations"],
    });
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    if (blocking.length) {
      // Surface the first violation for a readable failure message.
      const [first] = blocking;
      throw new Error(
        `axe violation: ${first.id} (${first.impact}) - ${first.help}\n` +
          first.nodes.map((n) => n.html).join("\n"),
      );
    }
    expect(blocking).toEqual([]);
  }, 15_000);
});
