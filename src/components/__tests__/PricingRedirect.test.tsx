/**
 * Verifies /pricing behavior:
 *  - Authenticated users are redirected to /upgrade (no blank screen, no crash).
 *  - Unauthenticated visitors still see the public Pricing page.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

vi.mock("@/pages/Pricing", () => ({
  default: () => <div data-testid="public-pricing">Public Pricing</div>,
}));

const authState: { user: any; loading: boolean } = { user: null, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

import PricingRedirect from "@/components/PricingRedirect";

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pricing" element={<PricingRedirect />} />
          <Route
            path="/upgrade"
            element={<div data-testid="upgrade-page">Upgrade Page</div>}
          />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("PricingRedirect", () => {
  it("redirects authenticated users from /pricing to /upgrade without a blank screen", async () => {
    authState.user = { id: "u_1", email: "u@vela.ai" };
    authState.loading = false;
    renderAt("/pricing");
    const upgrade = await screen.findByTestId("upgrade-page");
    expect(upgrade).toBeInTheDocument();
    expect(screen.queryByTestId("public-pricing")).toBeNull();
  });

  it("preserves query params and maps ?freq=yearly to ?cycle=annual", async () => {
    authState.user = { id: "u_1", email: "u@vela.ai" };
    let seenSearch = "";
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/pricing?plan=pro&freq=yearly"]}>
          <Routes>
            <Route path="/pricing" element={<PricingRedirect />} />
            <Route
              path="/upgrade"
              element={<CaptureSearch onSearch={(s) => (seenSearch = s)} />}
            />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
    await screen.findByTestId("upgrade-capture");
    expect(seenSearch).toContain("plan=pro");
    expect(seenSearch).toContain("cycle=annual");
    expect(seenSearch).not.toContain("freq=");
  });

  it("shows the public pricing page for unauthenticated visitors", () => {
    authState.user = null;
    renderAt("/pricing");
    expect(screen.getByTestId("public-pricing")).toBeInTheDocument();
  });
});

function CaptureSearch({ onSearch }: { onSearch: (s: string) => void }) {
  onSearch(window.location.search || "");
  return <div data-testid="upgrade-capture">Upgrade</div>;
}