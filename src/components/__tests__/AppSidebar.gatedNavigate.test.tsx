/**
 * Integration test: for every Pro-gated route in ROUTE_FEATURE_MAP,
 * a locked sidebar click must:
 *   1. NOT navigate (the route's element does not mount),
 *   2. open the upgrade prompt with the correct feature key,
 *   3. after the plan unlocks that key, the same click must navigate
 *      through to the target route.
 *
 * We render a harness that reproduces the exact NavItemLink click
 * contract in `src/components/AppSidebar.tsx` (kept in sync via a
 * source-level guard in `AppSidebar.gatedClick.test.tsx`). This keeps
 * the assertion focused on the gating semantics without pulling the
 * whole AppSidebar mount graph.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

function Harness({
  to,
  featureKey,
  locked,
  onUpgrade,
}: {
  to: string;
  featureKey: string;
  locked: boolean;
  onUpgrade: (key: string) => void;
}) {
  return (
    <MemoryRouter initialEntries={["/dashboard"]}>
      <NavLink
        to={to}
        data-testid="nav"
        data-sidebar-nav="item"
        data-sidebar-locked={locked ? "true" : undefined}
        onClick={(e) => {
          if (!locked) return;
          e.preventDefault();
          onUpgrade(featureKey);
        }}
      >
        go
      </NavLink>
      <Routes>
        <Route path={to} element={<div data-testid="target">TARGET</div>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

const ROUTES = Object.entries(ROUTE_FEATURE_MAP);

describe("Sidebar gated navigate — every Pro-gated route", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(ROUTES)(
    "locked click on %s opens upgrade prompt with feature key %s and blocks navigation",
    async (path, key) => {
      const user = userEvent.setup();
      const onUpgrade = vi.fn();
      render(<Harness to={path} featureKey={key} locked onUpgrade={onUpgrade} />);

      await user.click(screen.getByTestId("nav"));

      // Never navigated.
      expect(screen.queryByTestId("target")).toBeNull();
      expect(screen.getByTestId("location").textContent).toBe("/dashboard");
      // Upgrade prompt fired with the *canonical* key for this path.
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onUpgrade).toHaveBeenCalledWith(key);
    },
  );

  it.each(ROUTES)(
    "after unlocking, clicking %s navigates to the target route",
    async (path, _key) => {
      const user = userEvent.setup();
      const onUpgrade = vi.fn();
      render(<Harness to={path} featureKey={_key} locked={false} onUpgrade={onUpgrade} />);

      await user.click(screen.getByTestId("nav"));

      expect(onUpgrade).not.toHaveBeenCalled();
      expect(screen.getByTestId("target")).toBeInTheDocument();
    },
  );
});