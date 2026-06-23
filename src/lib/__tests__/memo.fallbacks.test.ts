import { describe, expect, it } from "vitest";
import { applyFallbacks } from "@/lib/memo/fallbacks";
import type { MemoInput } from "@/lib/memo/schema";

const base: MemoInput = {
  memo_type: "portfolio",
  meta: { title: "Test", base_currency: "EUR" },
};

describe("applyFallbacks", () => {
  it("drops empty marquee cells and never leaves a blank one", () => {
    const out = applyFallbacks({
      ...base,
      cover: {
        stats: [
          { label: "A", value: "1" },
          { label: "B", value: "—" },
          { label: "C", value: "" },
        ],
      },
    });
    expect(out.input.cover?.stats?.length).toBe(1);
    expect(out.input.cover?.stats?.[0].value).toBe("1");
  });

  it("omits correlation when not return-based", () => {
    const out = applyFallbacks({
      ...base,
      correlation: { method: "proxy_classification", labels: ["A", "B"], matrix: [[1, 0], [0, 1]] },
    });
    expect(out.input.correlation).toBeUndefined();
    expect(out.omitted).toContain("correlation");
  });

  it("keeps valid pearson correlation", () => {
    const out = applyFallbacks({
      ...base,
      correlation: { method: "pearson_log_1y", labels: ["A", "B"], matrix: [[1, 0.5], [0.5, 1]] },
    });
    expect(out.input.correlation).toBeDefined();
  });

  it("omits correlation when matrix is not square", () => {
    const out = applyFallbacks({
      ...base,
      correlation: { method: "pearson_log_1y", labels: ["A", "B", "C"], matrix: [[1, 0], [0, 1]] },
    });
    expect(out.input.correlation).toBeUndefined();
  });

  it("drops geography rows with zero or missing weight", () => {
    const out = applyFallbacks({
      ...base,
      geography_lookthrough: [
        { region: "US", weight: 60 },
        { region: "Unknown", weight: 0 },
      ],
    });
    expect(out.input.geography_lookthrough?.length).toBe(1);
  });

  it("sanitizes prose inside instruments", () => {
    const out = applyFallbacks({
      ...base,
      memo_type: "strategy",
      instruments: [
        {
          ticker: "SWDA",
          overview: "A robust fund — really.",
          rationale: "It will unlock returns.",
          risks: [{ name: "Market", desc: "Standard market risk." }],
        },
      ],
    });
    const i = out.input.instruments?.[0];
    expect(i?.overview ?? "").not.toMatch(/robust|—/);
    expect(i?.rationale ?? "").not.toMatch(/unlock/i);
  });
});