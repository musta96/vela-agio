/**
 * Accessibility + keyboard checks for the inline locked/upgrade callout
 * used inside gated reports (LockedPreview).
 *
 * Verifies:
 *  - axe-core reports no serious/critical violations on the locked state
 *  - the blurred continuation is properly aria-hidden and non-interactive
 *  - the "See what's inside" button is keyboard-reachable and triggers
 *    promptUpgrade when activated via Enter (focus moves to the callout)
 *  - the upgrade link has an accessible name and a real href
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";
import { LockedPreview } from "@/components/gating/LockedPreview";

const promptUpgrade = vi.fn();

vi.mock("@/hooks/useFeatureGate", () => ({
  useFeatureGate: () => ({
    entitlements: {
      loading: false,
      featureKeys: new Set<string>(),
      tier: "free",
      planSlug: "explorer",
    },
    catalog: [
      {
        key: "ai.backtests",
        name: "Backtesting",
        description: "Backtest strategies over history.",
      },
    ],
    plans: [
      {
        slug: "pro",
        name: "Pro",
        price_label: "$29/mo",
        feature_keys: ["ai.backtests"],
      },
    ],
    has: () => false,
    promptUpgrade,
    prompt: { open: false },
    setPrompt: () => {},
  }),
}));

vi.mock("@/components/UpgradeDialog", () => ({
  UpgradeDialog: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: async () => ({}) }),
  },
}));

async function serious(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
}

function renderLocked() {
  return render(
    <MemoryRouter>
      <LockedPreview
        feature="ai.backtests"
        previewSlot={<p>Preview section, always visible.</p>}
      >
        <p data-testid="hidden-body">Full report content behind the paywall.</p>
      </LockedPreview>
    </MemoryRouter>,
  );
}

describe("LockedPreview — a11y + keyboard for locked/upgrade callout", () => {
  it("has no serious/critical axe violations in the locked state", async () => {
    const { container } = renderLocked();
    // Sanity: the callout is actually rendered.
    expect(screen.getByRole("heading", { name: /backtesting|unlock/i })).toBeInTheDocument();
    const violations = await serious(container);
    expect(violations).toEqual([]);
  }, 15_000);

  it("hides the blurred continuation from assistive tech and disables pointer events", () => {
    renderLocked();
    const hidden = screen.getByTestId("hidden-body");
    // Radix/aria-hidden wrapper is the closest ancestor with aria-hidden="true".
    const wrapper = hidden.closest('[aria-hidden="true"]') as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper?.className).toMatch(/pointer-events-none/);
    expect(wrapper?.className).toMatch(/select-none/);
  });

  it("upgrade link has an accessible name and points at /upgrade", () => {
    renderLocked();
    const link = screen.getByRole("link", { name: /upgrade to pro/i });
    expect(link.getAttribute("href")).toMatch(/^\/upgrade(\?|$)/);
  });

  it("keyboard activation of 'See what's inside' triggers promptUpgrade", async () => {
    renderLocked();
    const button = screen.getByRole("button", { name: /see what's inside/i });

    const user = userEvent.setup();
    // Focus the button directly, then activate with Enter — this is the
    // exact keyboard path a screen-reader user would take.
    await act(async () => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);

    await act(async () => {
      await user.keyboard("{Enter}");
    });
    await waitFor(() => {
      expect(promptUpgrade).toHaveBeenCalledWith("ai.backtests");
    });
  });
});
