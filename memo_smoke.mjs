import jsPDFns from "jspdf";
const jsPDF = jsPDFns.jsPDF || jsPDFns.default || jsPDFns;
globalThis.__JSPDF_OVERRIDE = jsPDF;
import { generatePortfolioMemo } from "./src/lib/generatePortfolioMemo.ts";
import fs from "fs";
const days = 500;
const eq = [];
let v = 100;
for (let i = 0; i < days; i++) {
  v *= 1 + (Math.sin(i / 7) * 0.004 + (Math.random() - 0.5) * 0.012);
  eq.push({ t: Date.now() - (days - i) * 86_400_000, value: v });
}
const { filename, blob } = generatePortfolioMemo({
  allocation: { "SWDA.MI": 0.3, "EQQQ.MI": 0.2, "AGG": 0.2, "GLD": 0.1, "BTC-USD": 0.05, "VNQ": 0.05, "AAPL": 0.05, "JPM": 0.05 },
  strategyThesis: "A globally-diversified balanced strategy.",
  goals: ["retirement in 20 years"],
  riskProfile: "growth",
  portfolioName: "Vela Balanced Growth",
  simulation: { equity: eq, notional: 250000, mcConfig: { paths: 800, horizonDays: 252 } },
  download: false,
});
const buf = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync(`/tmp/${filename}`, buf);
console.log("OK", filename, buf.length);
