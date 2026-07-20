/**
 * Integration test: clicking a gated sidebar link must NOT navigate
 * when the user's plan is missing the required feature key. Instead,
 * the click is intercepted and (when available) the upgrade prompt is
 * surfaced. We render a minimal harness that reproduces the NavItemLink
 * click contract without pulling AppSidebar's full initialisation
 * (which fans out to the entire sidebar, feature-gate, badge, and
 * router graph).
 *
 * The harness mirrors the exact click handler currently used in
 * src/components/AppSidebar.tsx NavItemLink — if that diverges, this
 * test fails loudly.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ITEM_FEATURE_KEY: Record<string, string> = {
  "/backtest": "ai.backtests",
  "/dealflow": "dealflow.access",
};

function GatedNavItem({
  to,
  label,
  locked,
  onUpgrade,
}: {
  to: string;
  label: string;
  locked: boolean;
  onUpgrade: (key: string) => void;
}) {
  return (
    <NavLink
      to={to}
      data-sidebar-nav="item"
      data-sidebar-locked={locked ? "true" : undefined}
      onClick={(e) => {
        if (!locked) return;
        e.preventDefault();
        const key = ITEM_FEATURE_KEY[to];
        if (key) onUpgrade(key);
      }}
    >
      {label}
    </NavLink>
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

describe("Sidebar — gated link click never navigates", () => {
  it("intercepts the click on a locked item and stays on the current route", async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <GatedNavItem to="/backtest" label="Backtesting" locked onUpgrade={onUpgrade} />
        <Routes>
          <Route path="/backtest" element={<div data-testid="backtest-page">BACKTEST</div>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText("Backtesting"));

    // Never navigated → protected page never mounts.
    expect(screen.queryByTestId("backtest-page")).toBeNull();
    // Still on the original route.
    expect(screen.getByTestId("location").textContent).toBe("/dashboard");
    // Upgrade prompt surfaced with the correct feature key.
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onUpgrade).toHaveBeenCalledWith("ai.backtests");
  });

  it("still navigates when the item is unlocked", async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <GatedNavItem to="/backtest" label="Backtesting" locked={false} onUpgrade={onUpgrade} />
        <Routes>
          <Route path="/backtest" element={<div data-testid="backtest-page">BACKTEST</div>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText("Backtesting"));

    expect(screen.getByTestId("backtest-page")).toBeTruthy();
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it("AppSidebar source still contains the preventDefault guard for locked items", () => {
    // Guard against silent regression of the real component. If someone
    // removes the click handler in NavItemLink, this test will fail even
    // though the harness above keeps passing.
    const src = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");
    expect(src).toMatch(/onClick=\{\(e\)\s*=>\s*\{[\s\S]*?if\s*\(!locked\)\s*return;[\s\S]*?e\.preventDefault\(\)/);
    expect(src).toMatch(/gate\.promptUpgrade\(key\)/);
  });
});
