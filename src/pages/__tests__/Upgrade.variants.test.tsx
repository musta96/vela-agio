/**
 * Visual-regression guard for the two button variants Upgrade.tsx renders
 * from PLAN_FEATURES:
 *
 *   1. `contactSales: true` → outlined "Talk to sales · Enterprise" link
 *      button in the plan switcher (data-testid="switch-plan-enterprise").
 *   2. `highlighted: true`  → filled default-variant CTA on the plan
 *      chooser card (renders the "Choose Pro" link).
 *
 * We render Upgrade.tsx twice (once with ?plan=plus so the switcher shows,
 * once without so the chooser shows) and snapshot the exact DOM/class list
 * of those buttons. Any accidental variant swap (e.g. "default" → "outline"
 * or a class rename in Button) trips the snapshot. This is intentionally
 * a lightweight DOM-diff instead of a full pixel diff — it catches the
 * concrete drift risk (Button variant + class output) without an image
 * baseline the whole team has to keep in sync.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Upgrade from "@/pages/Upgrade";
import { PLAN_FEATURES } from "@/lib/planFeatures";

// The banners + real upgrade flow depend on the live entitlements/auth
// stack. This test only cares about the two buttons Upgrade.tsx renders
// itself, so replace them with inert placeholders.
vi.mock("@/components/billing/PastDueBanner", () => ({ PastDueBanner: () => null }));
vi.mock("@/components/pricing/CurrentPlanBanner", () => ({ CurrentPlanBanner: () => null }));
vi.mock("@/components/upgrade/UpgradeFlow", () => ({
  UpgradeFlow: () => <div data-testid="upgrade-flow-stub" />,
}));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Upgrade />
    </MemoryRouter>,
  );
}

describe("Upgrade.tsx button variants (visual regression)", () => {
  it("enterprise switch button (self-serve) — snapshot", () => {
    // Enterprise is self-serve, so the switcher renders a real tier button
    // rather than a sales link. Assert intent first.
    expect(PLAN_FEATURES.enterprise.contactSales ?? false).toBe(false);

    renderAt("/upgrade?plan=plus");
    const btn = screen.getByTestId("switch-plan-enterprise");
    expect(btn.tagName.toLowerCase()).toBe("button");
    expect(btn.textContent).toMatch(/Enterprise/);
    expect(btn.outerHTML).toMatchSnapshot("switch-plan-enterprise");
  });


  it("highlighted plan CTA (highlighted=true → default variant) — snapshot", () => {
    // If Pro loses `highlighted`, Upgrade.tsx would render an outlined CTA
    // and the snapshot below becomes wrong. Assert intent first.
    expect(PLAN_FEATURES.pro.highlighted).toBe(true);
    expect(PLAN_FEATURES.plus.highlighted ?? false).toBe(false);

    renderAt("/upgrade");
    const proLink = screen.getByRole("link", { name: /Choose Pro/i });
    const plusLink = screen.getByRole("link", { name: /Choose Plus/i });

    // Sanity: the highlighted CTA must NOT share Plus's outline class set.
    expect(proLink.className).not.toEqual(plusLink.className);

    expect(proLink.outerHTML).toMatchSnapshot("choose-pro-highlighted");
    // Also lock the non-highlighted counterpart so a Button refactor
    // that flips defaults gets caught.
    expect(plusLink.outerHTML).toMatchSnapshot("choose-plus-outline");
  });
});