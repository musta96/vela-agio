/**
 * Axe accessibility scan for the Upgrade page. Ensures the plan
 * chooser and the enterprise switcher meet WCAG interactive-name and
 * structural rules — because Upgrade is the destination for every
 * gated/locked route, regressions here quietly break the entire
 * paywall funnel for keyboard and screen-reader users.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";
import Upgrade from "@/pages/Upgrade";

vi.mock("@/components/billing/PastDueBanner", () => ({ PastDueBanner: () => null }));
vi.mock("@/components/pricing/CurrentPlanBanner", () => ({ CurrentPlanBanner: () => null }));
vi.mock("@/components/upgrade/UpgradeFlow", () => ({
  UpgradeFlow: () => <div data-testid="upgrade-flow-stub" />,
}));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

async function scan(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Upgrade />
    </MemoryRouter>,
  );
}

describe("Upgrade page — axe a11y", () => {
  it("plan chooser view has no serious axe violations", async () => {
    const { container } = renderAt("/upgrade");
    const violations = await scan(container);
    if (violations.length) {
      throw new Error(
        violations
          .map((v) => `${v.id} (${v.impact}) — ${v.help}`)
          .join("\n"),
      );
    }
    expect(violations).toEqual([]);
  }, 20_000);

  it("plan switcher view (contactSales branch) has no serious axe violations", async () => {
    const { container } = renderAt("/upgrade?plan=plus");
    const violations = await scan(container);
    if (violations.length) {
      throw new Error(
        violations
          .map((v) => `${v.id} (${v.impact}) — ${v.help}`)
          .join("\n"),
      );
    }
    expect(violations).toEqual([]);
  }, 20_000);
});
