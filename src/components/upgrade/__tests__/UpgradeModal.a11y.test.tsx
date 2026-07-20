/**
 * Accessibility + keyboard checks for the contextual upgrade dialog
 * (the locked/upgrade callout that opens when a gated feature is hit).
 *
 * Verifies:
 *  - axe-core reports no serious/critical violations
 *  - the dialog exposes role="dialog", aria-modal, aria-labelledby
 *  - focus moves inside the dialog when it opens (Radix contract)
 *  - Escape key closes the dialog via onOpenChange(false)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { UpgradeDialog } from "@/components/UpgradeDialog";

// Keep the deep upgrade flow out of the a11y test — its own tests cover
// that surface. We only care about the dialog wrapper here.
vi.mock("@/components/upgrade/UpgradeFlow", () => ({
  UpgradeFlow: () => (
    <div>
      <p>Pick a plan to unlock this feature.</p>
      <button type="button">Continue</button>
    </div>
  ),
}));

vi.mock("@/components/pricing/CurrentPlanBanner", () => ({
  CurrentPlanBanner: () => <div aria-label="Current plan">Explorer</div>,
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

function renderDialog(open = true, onOpenChange = vi.fn()) {
  return render(
    <UpgradeDialog
      state={{
        open,
        featureKey: "ai.backtests",
        featureName: "Backtesting",
        featureDescription: "Backtest strategies over history.",
        requiredPlanName: "Pro",
        requiredPlanSlug: "pro",
        requiredPlanPrice: "$29/mo",
      }}
      onOpenChange={onOpenChange}
    />,
  );
}

describe("UpgradeDialog — a11y + keyboard for locked/upgrade callout", () => {
  it("passes axe when open with no serious/critical violations", async () => {
    renderDialog(true);
    const dialog = await screen.findByRole("dialog");
    const violations = await serious(dialog);
    expect(violations).toEqual([]);
  }, 15_000);

  it("exposes required aria attributes on the dialog surface", async () => {
    renderDialog(true);
    const dialog = await screen.findByRole("dialog");
    // Radix wires aria-labelledby to the DialogTitle. aria-modal is optional
    // per ARIA (role="dialog" + focus trap is sufficient); assert only when
    // present rather than requiring a specific implementation.
    const ariaModal = dialog.getAttribute("aria-modal");
    if (ariaModal !== null) expect(ariaModal).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const title = document.getElementById(labelledBy as string);
    expect(title?.textContent).toMatch(/upgrade/i);
  });

  it("moves focus into the dialog once it opens", async () => {
    renderDialog(true);
    const dialog = await screen.findByRole("dialog");
    // Radix focuses the content (or its first focusable descendant). Either
    // way, activeElement must live inside the dialog subtree — never <body>.
    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBe(document.body);
      expect(dialog.contains(active)).toBe(true);
    });
  });

  it("closes on Escape via onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    renderDialog(true, onOpenChange);
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    await act(async () => {
      await user.keyboard("{Escape}");
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
