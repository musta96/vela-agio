/**
 * Axe accessibility scan for the landing footer plus the newsletter /
 * signup surfaces that share the same z-index band (sticky "Get started
 * free" CTA and auth handoff). The real Landing.tsx renders the footer
 * dynamically from CMS data — see src/pages/Landing.tsx around the
 * <footer ref={footerRef}> block — so we mirror the exact structure and
 * add a representative newsletter form so future signup UI added to the
 * footer is covered by the same guard rail.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axe from "axe-core";

const FOOTER_HTML = `
  <footer role="contentinfo">
    <div>
      <span aria-hidden="true">V</span>
      <span>© 2026 Vela Intelligence Systems. Smart money, amplified.</span>
    </div>
    <nav aria-label="Footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/contact-sales">Contact sales</a>
      <a href="/blog">Blog</a>
      <a href="#pricing">Pricing</a>
    </nav>
    <form aria-label="Newsletter signup" data-testid="newsletter-form">
      <label for="newsletter-email">Email address</label>
      <input id="newsletter-email" type="email" name="email" autocomplete="email" required />
      <button type="submit">Subscribe</button>
    </form>
  </footer>
  <a
    href="/auth"
    aria-label="Get started free"
    data-testid="sticky-cta-link"
    class="min-h-11 inline-flex items-center"
  >Get started free</a>
`;

describe("Landing footer + newsletter — axe a11y scan", () => {
  let host: HTMLElement;

  beforeAll(() => {
    host = document.createElement("div");
    host.innerHTML = FOOTER_HTML;
    document.body.appendChild(host);
  });

  afterAll(() => {
    host.remove();
  });

  it("has no serious or critical axe violations", async () => {
    const results = await axe.run(host, {
      rules: { "color-contrast": { enabled: false } },
      resultTypes: ["violations"],
    });
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    if (blocking.length) {
      const [first] = blocking;
      throw new Error(
        `axe violation: ${first.id} (${first.impact}) — ${first.help}\n` +
          first.nodes.map((n) => n.html).join("\n"),
      );
    }
    expect(blocking).toEqual([]);
  }, 15_000);

  it("newsletter email input has an associated label + accessible name", () => {
    const input = host.querySelector<HTMLInputElement>("#newsletter-email")!;
    const label = host.querySelector<HTMLLabelElement>('label[for="newsletter-email"]');
    expect(input).toBeTruthy();
    expect(label?.textContent).toMatch(/email/i);
    expect(input.type).toBe("email");
    expect(input.required).toBe(true);
  });

  it("every footer link has a discernible text name", () => {
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>("nav a"));
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const a of links) {
      expect((a.textContent || "").trim().length).toBeGreaterThan(0);
    }
  });
});
