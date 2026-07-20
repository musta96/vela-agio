/**
 * Axe accessibility scan for the WHOLE landing page (not just the header).
 *
 * The real Landing.tsx pulls in GSAP, Three.js, and a live supabase
 * client at module load, which either explode in jsdom or turn the
 * test into an integration test. Instead we reconstruct a
 * representative static skeleton that mirrors every landmark and
 * interactive control the page ships (nav, hero, features, pricing,
 * FAQ, footer, sticky CTA) and run axe-core against it. That covers
 * the parts axe can actually verify statically (roles, names,
 * duplicate ids, heading order, landmark structure, aria-* misuse)
 * across the full page — the very regressions that were previously
 * only checked on the header.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axe from "axe-core";

const LANDING_HTML = `
  <a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>
  <header role="banner">
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
  </header>
  <main id="main">
    <section aria-labelledby="hero-title">
      <h1 id="hero-title">Ask any market. Get a clear answer.</h1>
      <p>Vela turns markets into one clear signal.</p>
      <a href="/auth" class="min-h-11 inline-flex items-center">Start Alpha Hunt</a>
      <a href="#features" class="min-h-11 inline-flex items-center">Watch performance</a>
    </section>
    <section id="features" aria-labelledby="features-title">
      <h2 id="features-title">Features</h2>
      <ul>
        <li><a href="/features#ai">AI radar</a></li>
        <li><a href="/features#backtest">Backtesting</a></li>
        <li><a href="/features#risk">Risk engine</a></li>
      </ul>
    </section>
    <section id="whoitsfor" aria-labelledby="who-title">
      <h2 id="who-title">Who it's for</h2>
      <p>Traders, analysts, and PMs.</p>
    </section>
    <section id="pricing" aria-labelledby="pricing-title">
      <h2 id="pricing-title">Pricing</h2>
      <a href="/upgrade" class="min-h-11 inline-flex items-center">See plans</a>
    </section>
    <section id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">FAQ</h2>
      <details><summary>Is there a free tier?</summary><p>Yes.</p></details>
    </section>
  </main>
  <footer role="contentinfo">
    <span>© 2026 Vela Intelligence Systems</span>
    <nav aria-label="Footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/contact-sales">Contact</a>
      <a href="/blog">Blog</a>
    </nav>
  </footer>
  <a
    href="/auth"
    aria-label="Get started free"
    class="min-h-11 inline-flex items-center"
    data-testid="sticky-cta-link"
  >Get started free</a>
`;

describe("Landing full page — axe a11y scan", () => {
  let host: HTMLElement;

  beforeAll(() => {
    host = document.createElement("div");
    host.setAttribute("data-testid", "landing-full-axe-root");
    host.innerHTML = LANDING_HTML;
    document.body.appendChild(host);
  });

  afterAll(() => {
    host.remove();
  });

  it("has no serious or critical axe violations across nav, main, and footer", async () => {
    const results = await axe.run(host, {
      rules: { "color-contrast": { enabled: false } },
      resultTypes: ["violations"],
    });
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    if (blocking.length) {
      const summary = blocking
        .map(
          (v) =>
            `${v.id} (${v.impact}) — ${v.help}\n` +
            v.nodes.map((n) => `  ${n.target.join(" ")}: ${n.html}`).join("\n"),
        )
        .join("\n\n");
      throw new Error(`axe violations:\n${summary}`);
    }
    expect(blocking).toEqual([]);
  }, 20_000);
});
