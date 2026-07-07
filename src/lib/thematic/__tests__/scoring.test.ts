import { describe, it, expect } from "vitest";
import { scoreCompany, rankCompanies, regionFromSymbol, bandFromMarketCap } from "../scoring";
import type { RankedCompany } from "../schema";

describe("thematic scoring", () => {
  it("gives pure-play a meaningful bonus over adjacent", () => {
    const base = { revGrowth: 0.2, pe: 20, sentiment: 0, marketCap: 5e9 } as const;
    const pure = scoreCompany({ ...base, exposure: "pure-play" });
    const adj = scoreCompany({ ...base, exposure: "adjacent" });
    expect(pure).toBeGreaterThan(adj + 15);
  });

  it("Discovery mode lifts small caps above mega caps on equal fundamentals", () => {
    const shape = { exposure: "pure-play" as const, revGrowth: 0.25, pe: 25, sentiment: 0.2 };
    const smallOff = scoreCompany({ ...shape, marketCap: 5e8 });
    const megaOff = scoreCompany({ ...shape, marketCap: 2e12 });
    expect(smallOff).toBeCloseTo(megaOff, 5); // no discovery = same score
    const smallOn = scoreCompany({ ...shape, marketCap: 5e8, discoveryMode: true });
    const megaOn = scoreCompany({ ...shape, marketCap: 2e12, discoveryMode: true });
    expect(smallOn).toBeGreaterThan(megaOn);
  });

  it("rankCompanies breaks ties alphabetically by symbol", () => {
    const rows: RankedCompany[] = [
      { symbol: "BBB", name: "b", segment: "components", exposure: "partial", score: 50 },
      { symbol: "AAA", name: "a", segment: "components", exposure: "partial", score: 50 },
      { symbol: "CCC", name: "c", segment: "components", exposure: "partial", score: 70 },
    ];
    expect(rankCompanies(rows).map((r) => r.symbol)).toEqual(["CCC", "AAA", "BBB"]);
  });

  it("infers regions from Yahoo suffixes", () => {
    expect(regionFromSymbol("AAPL")).toBe("na");
    expect(regionFromSymbol("ASML.AS")).toBe("eu");
    expect(regionFromSymbol("SHEL.L")).toBe("eu");
    expect(regionFromSymbol("9988.HK")).toBe("asia");
    expect(regionFromSymbol("VALE3.SA")).toBe("other");
  });

  it("bands market cap correctly", () => {
    expect(bandFromMarketCap(50_000_000_000)).toBe("large");
    expect(bandFromMarketCap(4_000_000_000)).toBe("mid");
    expect(bandFromMarketCap(500_000_000)).toBe("small");
    expect(bandFromMarketCap(null)).toBe("unknown");
  });
});