import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StrategyBuilderCard } from "@/components/technical/StrategyBuilderCard";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), require: vi.fn(), promptUpgrade: vi.fn(), toast: vi.fn(),
  loading: false, user: { id: "preview-user" } as { id: string } | null,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useFeatureGate", () => ({ useFeatureGate: () => ({
  entitlements: { loading: mocks.loading }, require: mocks.require,
  promptUpgrade: mocks.promptUpgrade, prompt: { open: false }, setPrompt: vi.fn(),
}) }));
vi.mock("@/components/UpgradeDialog", () => ({ UpgradeDialog: () => null }));
vi.mock("@/components/backtest/BacktestDetailCharts", () => ({ BacktestDetailCharts: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
} }));

function preview() {
  render(<MemoryRouter><StrategyBuilderCard symbol="AAPL" timeframe="1Y" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Preview backtest" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loading = false;
  mocks.user = { id: "preview-user" };
  mocks.require.mockReturnValue(true);
  mocks.invoke.mockResolvedValue({ data: {
    equity: [], trades: [], metrics: { totalReturn: 2, benchReturn: 3, maxDrawdown: -1, sharpe: 1 },
  }, error: null });
});

describe("Strategy preview access", () => {
  it("checks ai.backtests and does not request a preview without access", () => {
    mocks.require.mockReturnValue(false);
    preview();
    expect(mocks.require).toHaveBeenCalledWith("ai.backtests");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("allows entitled users to run the custom AAPL preview", async () => {
    preview();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("backtest-strategy", {
      body: expect.objectContaining({ holdings: [{ symbol: "AAPL", weight: 1 }], strategy: "custom", range: "1Y" }),
    }));
    await waitFor(() => expect(mocks.toast).not.toHaveBeenCalled());
  });
  it("opens the upgrade flow if the server denies stale client access", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: {
      context: new Response(JSON.stringify({ error: "upgrade_required" }), { status: 403 }),
    } });
    preview();
    await waitFor(() => expect(mocks.promptUpgrade).toHaveBeenCalledWith("ai.backtests"));
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("does not run previews while entitlements are loading", () => {
    mocks.loading = true;
    preview();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.require).not.toHaveBeenCalled();
  });
  it("does not request a preview without a signed-in user", () => {
    mocks.user = null;
    preview();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not misclassify plan-check outages as upgrade denials", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "entitlement_check_failed" }, error: null });
    preview();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.promptUpgrade).not.toHaveBeenCalled();
  });
});