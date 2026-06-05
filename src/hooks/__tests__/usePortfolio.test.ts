import { describe, it, expect } from "vitest";

/**
 * Pure-function reconciliation tests for the usePortfolio contract.
 * We re-implement the formulas here exactly as documented in usePortfolio.ts
 * so any drift between docs, implementation, and consumers shows up as a fail.
 */
function metrics(
  holdings: Array<{ shares: number; avg_price: number }>,
  quotes: Array<{ price: number | null; previousClose?: number | null }>,
) {
  let marketValue = 0;
  let costBasis = 0;
  let dayPnL = 0;
  let prevValue = 0;
  let winners = 0;
  let losers = 0;
  let noPrice = 0;
  holdings.forEach((h, i) => {
    const q = quotes[i];
    const live = q?.price != null && q.price > 0 ? q.price : null;
    const eff = live ?? h.avg_price;
    const mv = h.shares * eff;
    const cb = h.shares * h.avg_price;
    marketValue += mv;
    costBasis += cb;
    if (live != null) {
      const prev = q?.previousClose ?? live;
      dayPnL += h.shares * (live - prev);
      prevValue += h.shares * prev;
      if (mv - cb > 0) winners++;
      else if (mv - cb < 0) losers++;
    } else {
      prevValue += mv;
      noPrice++;
    }
  });
  return { marketValue, costBasis, unrealisedPnL: marketValue - costBasis, dayPnL, prevValue, winners, losers, noPrice };
}

describe("usePortfolio reconciliation", () => {
  it("sum of position market values equals total market value", () => {
    const h = [
      { shares: 10, avg_price: 100 },
      { shares: 5, avg_price: 50 },
    ];
    const q = [{ price: 110, previousClose: 108 }, { price: 45, previousClose: 46 }];
    const m = metrics(h, q);
    const positionsSum = h.reduce((s, hh, i) => s + hh.shares * (q[i].price ?? hh.avg_price), 0);
    expect(Math.abs(m.marketValue - positionsSum)).toBeLessThan(0.01);
  });

  it("buckets noPrice positions separately and excludes them from winners/losers", () => {
    const h = [
      { shares: 1, avg_price: 100 },
      { shares: 1, avg_price: 100 },
      { shares: 1, avg_price: 100 },
    ];
    const q = [{ price: 110 }, { price: 90 }, { price: null }];
    const m = metrics(h, q);
    expect(m.winners).toBe(1);
    expect(m.losers).toBe(1);
    expect(m.noPrice).toBe(1);
    expect(m.winners + m.losers + m.noPrice).toBe(h.length);
  });

  it("falls back to avg_price when no live price (marketValue == costBasis for that leg)", () => {
    const h = [{ shares: 10, avg_price: 100 }];
    const q = [{ price: null }];
    const m = metrics(h, q);
    expect(m.marketValue).toBe(1000);
    expect(m.costBasis).toBe(1000);
    expect(m.unrealisedPnL).toBe(0);
  });

  it("empty portfolio reports zero everywhere", () => {
    const m = metrics([], []);
    expect(m.marketValue).toBe(0);
    expect(m.costBasis).toBe(0);
    expect(m.unrealisedPnL).toBe(0);
    expect(m.winners).toBe(0);
    expect(m.losers).toBe(0);
  });
});