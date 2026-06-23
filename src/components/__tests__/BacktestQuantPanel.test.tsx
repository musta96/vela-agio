import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BacktestQuantPanel } from "@/components/BacktestQuantPanel";
import { encodeQuantParam } from "@/lib/quantShareLink";
import { __resetMonteCarloCache } from "@/lib/bootstrapMonteCarlo";

/**
 * Integration tests for the Backtest Quantitative Analysis panel.
 *
 * Covers:
 *   - `?quant=` URL hydration (settings are restored on mount).
 *   - Monte Carlo histogram + percentile tiles render with deterministic
 *     fixtures (no flaky numeric assertions — we check the tiles exist).
 *   - Drill-down sheet opens when a VaR row, scenario row, or factor row
 *     is activated.
 */

// Mock ResizeObserver — recharts/radix rely on it under jsdom.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom global
global.ResizeObserver = global.ResizeObserver || RO;

// jsdom doesn't implement these — required by radix Sheet & recharts.
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
  // @ts-expect-error - shim for radix
  window.PointerEvent = class extends Event {};
}

// Build a deterministic equity curve: 260 daily bars of a tiny sine-wave drift.
function makeEquity(n = 260, start = 10_000): { t: number; value: number }[] {
  const out: { t: number; value: number }[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v *= 1 + Math.sin(i / 7) * 0.005;
    out.push({ t: Date.now() - (n - i) * 86_400_000, value: v });
  }
  return out;
}

const HOLDINGS = [
  { symbol: "AAPL", weight: 0.5, name: "Apple Inc." },
  { symbol: "MSFT", weight: 0.3, name: "Microsoft" },
  { symbol: "TLT", weight: 0.2, name: "20Y Treasury ETF" },
];

function renderPanel({ initialPath = "/backtest" }: { initialPath?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BacktestQuantPanel equity={makeEquity()} holdings={HOLDINGS} currency="€" strategy="test" range="1y" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  __resetMonteCarloCache();
  vi.restoreAllMocks();
});

describe("BacktestQuantPanel — Monte Carlo rendering", () => {
  it("renders the percentile tiles + histogram caption", () => {
    renderPanel();
    expect(screen.getByText("Expected (P50)")).toBeInTheDocument();
    expect(screen.getByText("Downside (P5)")).toBeInTheDocument();
    expect(screen.getByText("Upside (P95)")).toBeInTheDocument();
    expect(screen.getByText("P(loss)")).toBeInTheDocument();
    expect(screen.getByText(/Distribution of/i)).toBeInTheDocument();
    expect(screen.getByText(/Fan chart/i)).toBeInTheDocument();
  });
});

describe("BacktestQuantPanel — ?quant= hydration", () => {
  it("restores horizon, paths and confidence from URL token on mount", () => {
    const token = encodeQuantParam({
      s: { horizonDays: 126, paths: 800, confidences: [0.9, 0.99] },
    });
    renderPanel({ initialPath: `/backtest?quant=${token}` });
    // Horizon = 126 → "6M" preset wins the label race.
    expect(screen.getByText(/Distribution of 6M terminal value · 800 paths/i)).toBeInTheDocument();
  });

  it("falls back to defaults when the token is missing", () => {
    renderPanel();
    expect(screen.getByText(/Distribution of 1Y terminal value · 1,500 paths/i)).toBeInTheDocument();
  });
});

describe("BacktestQuantPanel — drill-down navigation", () => {
  it("opens the VaR/CVaR sheet when a risk row is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: /VaR \/ CVaR/i }));
    // The first tile is "VaR 95%" — click it to open the sheet.
    const tile = screen.getAllByRole("button", { name: /VaR \d+%/i })[0];
    fireEvent.click(tile);
    expect(screen.getByText(/Loss attribution/i)).toBeInTheDocument();
  });

  it("opens the factor sheet when an asset-class row is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: /Factors/i }));
    // Each factor row carries an aria-label "Open attribution for <title> · <key>".
    const row = screen.getAllByRole("button", { name: /Open attribution for/i })[0];
    fireEvent.click(row);
    // Sheet renders "Contributing holdings" header for bucket drilldowns.
    expect(screen.getByText(/Contributing holdings/i)).toBeInTheDocument();
  });
});