import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { generatePortfolioMemo } from "@/lib/generatePortfolioMemo";

// Smoke test: generate a fully-populated memo with all 9 chapters firing
// (simulation block supplied) and persist it to /mnt/documents for visual QA.
// Vitest runs in jsdom so the production `import jsPDF from "jspdf"` interop
// works the same way it does in Vite.

describe("generatePortfolioMemo", () => {
  it("renders a multi-chapter PDF with simulation", async () => {
    const days = 500;
    const eq: { t: number; value: number }[] = [];
    let v = 100;
    // Deterministic synthetic series so the smoke output is reproducible.
    for (let i = 0; i < days; i++) {
      const r = Math.sin(i / 7) * 0.004 + (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.014;
      v *= 1 + r;
      eq.push({ t: Date.now() - (days - i) * 86_400_000, value: v });
    }

    const { filename, blob } = generatePortfolioMemo({
      allocation: {
        "SWDA.MI": 0.30, "EQQQ.MI": 0.20, "AGG": 0.20, "GLD": 0.10,
        "BTC-USD": 0.05, "VNQ": 0.05, "AAPL": 0.05, "JPM": 0.05,
      },
      strategyThesis:
        "A globally-diversified balanced strategy combining broad equity beta, an inflation hedge via gold, " +
        "fixed-income ballast, and a small high-conviction satellite in digital assets. The thesis is to " +
        "capture long-run risk premia while keeping max drawdown bounded by the bond + gold sleeve, " +
        "suitable for an investor with a 10y+ horizon and growth risk appetite.",
      goals: ["retirement in 20 years", "preserve real purchasing power", "outperform inflation + 3%"],
      riskProfile: "growth",
      portfolioName: "Vela Balanced Growth",
      currency: "EUR",
      simulation: { equity: eq, notional: 250_000, mcConfig: { paths: 600, horizonDays: 252, seed: 7 } },
      download: false,
    });

    expect(filename).toMatch(/^vela-portfolio-memo-Vela_Balanced_Growth-\d{4}-\d{2}-\d{2}\.pdf$/);
    const buf = await toBuffer(blob);
    expect(buf.length).toBeGreaterThan(20_000);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");

    if (process.env.WRITE_ARTIFACT === "1") {
      mkdirSync("/mnt/documents", { recursive: true });
      writeFileSync(`/mnt/documents/${filename}`, buf);
    }
  });

  it("falls back to qualitative risk + performance copy when no simulation supplied", async () => {
    const { blob } = generatePortfolioMemo({
      allocation: { "AAPL": 0.5, "AGG": 0.5 },
      strategyThesis: "Minimal two-sleeve test.",
      goals: ["test"],
      riskProfile: "balanced",
      download: false,
    });
    const buf = await toBuffer(blob);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(8_000);
  });

  it("throws on an empty allocation", () => {
    expect(() => generatePortfolioMemo({
      allocation: {},
      strategyThesis: "x",
      goals: [],
      riskProfile: "balanced",
      download: false,
    })).toThrow();
  });
});