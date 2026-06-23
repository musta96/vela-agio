import { describe, expect, it } from "vitest";
import { sanitizeProse, sanitizeParagraphs } from "@/lib/memo/sanitizeProse";

describe("sanitizeProse", () => {
  it("strips em dashes", () => {
    expect(sanitizeProse("The market is up — for now.")).not.toMatch(/—/);
  });
  it("keeps numeric en-dash ranges", () => {
    expect(sanitizeProse("Returns 2008–2009 were poor.")).toMatch(/2008–2009/);
  });
  it("removes banned words", () => {
    const out = sanitizeProse("This robust strategy will unlock pivotal returns.");
    expect(out.toLowerCase()).not.toMatch(/robust|unlock|pivotal/);
  });
  it("collapses hedging stacks", () => {
    const out = sanitizeProse("It may potentially possibly happen.");
    expect(out.toLowerCase()).not.toMatch(/potentially/);
  });
  it("removes banned constructions", () => {
    const out = sanitizeProse("It's not just a fund, it's a strategy. Real content follows.");
    expect(out).toMatch(/Real content follows/);
    expect(out.toLowerCase()).not.toMatch(/it'?s not just/);
  });
  it("returns empty paragraphs filtered out", () => {
    expect(sanitizeParagraphs(["", "  ", "Hello world"])).toEqual(["Hello world"]);
  });
});