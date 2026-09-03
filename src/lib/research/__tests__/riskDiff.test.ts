import { describe, it, expect } from "vitest";
import { classifyRisks, summarizeRisks, inferSeverity } from "../riskChecklist";
import { diffWords, diffRisks, narrativeDiffs } from "../diff";

describe("classifyRisks", () => {
  it("normalizes categories, severities and citations", () => {
    const out = classifyRisks([
      { title: "FX exposure", detail: "EUR/USD swings", severity: "Media", category: "Market", citation: { quote: "we are exposed to FX", section: "Item 7A" } },
      { title: "Litigation", detail: "Pending litigation could be material", category: "unknown-cat" },
      { title: "", detail: "" },
    ]);
    expect(out).toHaveLength(2);
    const fx = out.find((r) => r.title === "FX exposure")!;
    expect(fx.severity).toBe("medium");
    expect(fx.category).toBe("market");
    expect(fx.cited).toBe(true);
    const lit = out.find((r) => r.title === "Litigation")!;
    expect(lit.category).toBe("other");
    expect(lit.severity).toBe("high");
    expect(lit.severityInferred).toBe(true);
    expect(lit.cited).toBe(false);
  });

  it("sorts by severity descending", () => {
    const out = classifyRisks([
      { title: "B", detail: "routine matter", severity: "low" },
      { title: "A", detail: "x", severity: "high" },
    ]);
    expect(out.map((r) => r.severity)).toEqual(["high", "low"]);
  });

  it("infers severity from wording", () => {
    expect(inferSeverity("material weakness in controls")).toBe("high");
    expect(inferSeverity("routine matters")).toBe("low");
    expect(inferSeverity("supply chain timing")).toBe("medium");
  });

  it("summarizes counts and citation coverage", () => {
    const s = summarizeRisks(classifyRisks([
      { title: "A", detail: "a", severity: "high", category: "legal", citation: { quote: "q" } },
      { title: "B", detail: "b", severity: "low", category: "legal" },
    ]));
    expect(s.total).toBe(2);
    expect(s.high).toBe(1);
    expect(s.citedShare).toBe(0.5);
    expect(s.byCategory[0]).toEqual({ category: "legal", count: 2 });
  });
});

describe("diffWords", () => {
  it("marks added and removed words", () => {
    const d = diffWords("revenue grew 5%", "revenue grew 9%");
    expect(d.some((t) => t.op === "removed" && t.text.includes("5%"))).toBe(true);
    expect(d.some((t) => t.op === "added" && t.text.includes("9%"))).toBe(true);
  });

  it("returns only same tokens for identical text", () => {
    expect(diffWords("same text", "same text").every((t) => t.op === "same")).toBe(true);
  });
});

describe("diffRisks", () => {
  it("detects added, removed and escalated risks", () => {
    const before = { risks: [{ title: "FX", detail: "x", severity: "low" }, { title: "Supply", detail: "y", severity: "medium" }] };
    const after = { risks: [{ title: "FX", detail: "x", severity: "high" }, { title: "Cyber", detail: "z", severity: "medium" }] };
    const d = diffRisks(before, after);
    expect(d.added.map((r) => r.title)).toEqual(["Cyber"]);
    expect(d.removed.map((r) => r.title)).toEqual(["Supply"]);
    expect(d.escalated[0]).toMatchObject({ from: "low", to: "high" });
  });
});

describe("narrativeDiffs", () => {
  it("flags changed narrative fields only when they differ", () => {
    const diffs = narrativeDiffs(
      { executiveSummary: "solid quarter", guidance: { direction: "reiterated", summary: "FY intact" } },
      { executiveSummary: "solid quarter", guidance: { direction: "lowered", summary: "FY cut" } },
    );
    expect(diffs.find((d) => d.field === "executiveSummary")!.changed).toBe(false);
    expect(diffs.find((d) => d.field === "guidance")!.changed).toBe(true);
  });
});
