/**
 * Verifies that RouteFeatureGate degrades gracefully instead of hard-
 * crashing when an unexpected render error escapes the gate. The
 * user-facing fallback must:
 *   - render inside a role="alert" region so assistive tech surfaces it,
 *   - provide a recovery affordance (dashboard link + refresh button),
 *   - never leak internal diagnostics (feature keys, stack traces).
 *
 * We test the fallback UI directly (its module export) — the sanity-
 * check throw is still asserted separately in
 * `RouteFeatureGate.sanityCheck.test.tsx`, and the boundary re-throws
 * in test mode so that assertion is unaffected.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteFeatureGateFallback } from "@/components/gating/RouteFeatureGate";

describe("RouteFeatureGate — user-friendly fallback", () => {
  it("renders as an alert with a recovery path", () => {
    render(<RouteFeatureGateFallback reason="mismatch" />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("data-gate-fallback", "mismatch");

    // User-facing copy is non-technical.
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();

    // Recovery affordances.
    const dash = screen.getByRole("link", { name: /dashboard/i });
    expect(dash).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });

  it("does not leak internal diagnostics (feature keys, pathnames)", () => {
    const { container } = render(<RouteFeatureGateFallback reason="mismatch" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/feature key/i);
    expect(text).not.toMatch(/ROUTE_FEATURE_MAP/);
    expect(text).not.toMatch(/dealflow|portfolio\.simulations/);
  });
});