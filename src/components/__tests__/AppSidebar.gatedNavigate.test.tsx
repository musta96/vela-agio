/**
 * Integration test: for every gated route in ROUTE_FEATURE_MAP, a locked
 * sidebar click MUST navigate to the target route. The destination page
 * renders the full marketing-style upgrade screen via <RouteFeatureGate>,
 * so intercepting the click at the sidebar would only hide value.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function Harness({ to, locked }: { to: string; locked: boolean }) {
  return (
    <MemoryRouter initialEntries={["/dashboard"]}>
      <NavLink
        to={to}
        data-testid="nav"
        data-sidebar-nav="item"
        data-sidebar-locked={locked ? "true" : undefined}
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

const ROUTES = Object.entries(ROUTE_FEATURE_MAP);

describe("Sidebar gated navigate — every gated route stays navigable", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(ROUTES)("locked click on %s navigates through", async (path) => {
    const user = userEvent.setup();
    render(<Harness to={path} locked />);
    await user.click(screen.getByTestId("nav"));
    expect(screen.getByTestId("target")).toBeInTheDocument();
  });

  it.each(ROUTES)("unlocked click on %s navigates through", async (path) => {
    const user = userEvent.setup();
    render(<Harness to={path} locked={false} />);
    await user.click(screen.getByTestId("nav"));
    expect(screen.getByTestId("target")).toBeInTheDocument();
  });
});