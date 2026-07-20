/**
 * End-to-end keyboard + focus contract for the locked upgrade dialog opened
 * from the sidebar.
 *
 * Covers two guarantees users rely on:
 *  1. Opening the dialog from a gated sidebar link, completing a keyboard-only
 *     flow, and closing it returns focus to the *originating* link.
 *  2. Focus is trapped inside the dialog while it is open — Tab/Shift+Tab
 *     cycle among the dialog's focusable elements and never leak back to the
 *     sidebar link until the dialog is dismissed.
 *
 * These are behaviours provided by Radix Dialog, but they are load-bearing
 * for accessibility and easy to regress if the wrapper markup changes, so we
 * pin them here against the real UpgradeDialog surface.
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpgradeDialog } from "@/components/UpgradeDialog";

// Keep the deep upgrade flow out of these tests — we only care about the
// dialog wrapper's focus semantics. Render a small, predictable set of
// focusable elements inside so we can assert cycling.
vi.mock("@/components/upgrade/UpgradeFlow", () => ({
  UpgradeFlow: () => (
    <div>
      <button type="button" data-testid="flow-primary">
        Continue
      </button>
      <button type="button" data-testid="flow-secondary">
        Compare plans
      </button>
    </div>
  ),
}));

vi.mock("@/components/pricing/CurrentPlanBanner", () => ({
  CurrentPlanBanner: () => <div aria-label="Current plan">Explorer</div>,
}));

/**
 * Harness mirroring the NavItemLink → promptUpgrade contract exercised in
 * `AppSidebar.gatedNavigate.test.tsx`. Clicking the locked link opens the
 * real UpgradeDialog with a feature key. Closing the dialog fires
 * `onOpenChange(false)` which unmounts it, exactly like production.
 */
function SidebarHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href="/simulations"
        data-testid="locked-link"
        data-sidebar-locked="true"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        Simulations
      </a>
      <UpgradeDialog
        state={{
          open,
          featureKey: "advanced_analytics",
          featureName: "Simulations",
          featureDescription: "Run Monte Carlo simulations.",
          requiredPlanName: "Pro",
          requiredPlanSlug: "pro",
          requiredPlanPrice: "$29/mo",
        }}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("UpgradeDialog — sidebar keyboard flow", () => {
  it("opens from a locked sidebar link, closes via keyboard, and restores focus to the link", async () => {
    const user = userEvent.setup();
    render(<SidebarHarness />);

    const link = screen.getByTestId("locked-link");
    // Move focus with the keyboard the same way a keyboard-only user would.
    link.focus();
    expect(document.activeElement).toBe(link);

    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Radix moves focus inside the dialog on open — confirm focus is no
    // longer on the originating link.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(link);
    });

    // Complete a small keyboard flow inside the dialog before dismissing.
    await user.tab();
    await user.tab();

    // Escape closes via Radix onOpenChange → harness setState(false).
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Focus must return to the sidebar link that opened the dialog so a
    // keyboard user is not dumped at the top of the document.
    await waitFor(() => {
      expect(document.activeElement).toBe(link);
    });
  });

  it("traps focus inside the dialog when tabbing forward and backward", async () => {
    const user = userEvent.setup();
    render(<SidebarHarness />);

    const link = screen.getByTestId("locked-link");
    link.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Tab forward many times — every stop must remain within the dialog.
    // Using a generous count ensures we would cycle past the last element
    // at least once and catch focus escaping back to the sidebar link.
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(link);
    }

    // Tab backwards the same way — Shift+Tab must also stay trapped and
    // never bubble focus to the originating link.
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(link);
    }

    // Sanity: once we close the dialog, focus is no longer trapped.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(link);
    });
  });
});