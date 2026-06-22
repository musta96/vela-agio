import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock router navigation
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

// Mock the analytics module so tests don't hit Supabase
vi.mock("@/lib/aiAnalytics", () => ({
  trackAIEvent: vi.fn(),
  __resetAIAnalyticsForTests: () => {},
}));

// Hooks
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
vi.mock("@/hooks/usePortfolios", () => ({ usePortfolios: () => ({ active: { id: "p-1" } }) }));
vi.mock("@/hooks/useWatchlist", () => ({ useWatchlist: () => ({ items: [{ symbol: "AAPL", name: "Apple" }] }) }));

// Supabase client mock - we control what functions.invoke + from() return per test.
const invokeMock = vi.fn();
// Build a thenable that also exposes the same chain methods. Any await
// resolves to { data: [], error: null } so the briefing's portfolio + profile
// queries never block the generate() flow.
function makeChain(): any {
  const target: any = {
    select: () => makeChain(),
    eq: () => makeChain(),
    order: () => makeChain(),
    limit: () => makeChain(),
    maybeSingle: async () => ({ data: { briefing_focus: "" }, error: null }),
    insert: async () => ({ error: null }),
    then: (resolve: (v: any) => void) => resolve({ data: [], error: null }),
  };
  return target;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
    from: () => makeChain(),
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
  },
}));

async function importBriefing() {
  const mod = await import("../AIBriefing");
  return mod.AIBriefing;
}

function renderBriefing(C: React.ComponentType) {
  return render(
    <MemoryRouter>
      <C />
    </MemoryRouter>,
  );
}

const deniedPayload = {
  error: "ai_access_denied",
  reason: "AI is a paid feature. Upgrade or add your own API key in Settings.",
  tier: "free",
  upgrade_url: "/pricing",
  byo_url: "/settings?tab=Connections",
};

describe("AIBriefing - ai_access_denied fallback", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    navigateSpy.mockReset();
  });

  it("renders Upgrade + BYO CTA when edge returns 200 ai_access_denied body", async () => {
    invokeMock.mockResolvedValue({ data: deniedPayload, error: null });
    const AIBriefing = await importBriefing();
    renderBriefing(AIBriefing);
    expect(await screen.findByText("Upgrade plan")).toBeInTheDocument();
    expect(await screen.findByText("Use my own API key")).toBeInTheDocument();
    expect(await screen.findByText(deniedPayload.reason)).toBeInTheDocument();
    // Critical: no blank screen - the briefing container is rendered.
    expect(screen.getByText(/Vela AI · Market briefing/)).toBeInTheDocument();
  });

  it("renders Upgrade + BYO CTA when invoke surfaces ai_access_denied JSON in error.message", async () => {
    const err = new Error(`Edge function returned 402: Error, ${JSON.stringify(deniedPayload)}`);
    invokeMock.mockResolvedValue({ data: null, error: err });
    const AIBriefing = await importBriefing();
    renderBriefing(AIBriefing);
    expect(await screen.findByText("Upgrade plan")).toBeInTheDocument();
    expect(await screen.findByText("Use my own API key")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't generate briefing/)).not.toBeInTheDocument();
  });

  it("renders Upgrade + BYO CTA when invoke throws with the 402 body in message", async () => {
    invokeMock.mockRejectedValue(
      new Error(`Edge function returned 402: Error, ${JSON.stringify(deniedPayload)}`),
    );
    const AIBriefing = await importBriefing();
    renderBriefing(AIBriefing);
    expect(await screen.findByText("Upgrade plan")).toBeInTheDocument();
    expect(await screen.findByText("Use my own API key")).toBeInTheDocument();
  });
});