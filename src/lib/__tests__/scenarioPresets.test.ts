import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetPresetsForTests,
  deletePreset,
  getPreset,
  listPresets,
  savePreset,
} from "@/lib/scenarioPresets";

describe("scenarioPresets localStorage CRUD", () => {
  beforeEach(() => {
    _resetPresetsForTests();
  });

  it("saves and lists macro presets", () => {
    const payload = { equity: -10, ratesBps: 50, creditBps: 100, oil: 5, gold: 0, usd: 2 };
    const saved = savePreset("macro", "Mild stress", payload);
    expect(saved.scope).toBe("macro");
    expect(saved.payload).toEqual(payload);
    const list = listPresets("macro");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Mild stress");
  });

  it("overwrites a preset when the same name is saved twice", () => {
    const first = savePreset("macro", "House view", { equity: -10, ratesBps: 0, creditBps: 0, oil: 0, gold: 0, usd: 0 });
    const second = savePreset("macro", "House view", { equity: -20, ratesBps: 100, creditBps: 50, oil: 0, gold: 0, usd: 0 });
    expect(second.id).toBe(first.id);
    expect(listPresets("macro")).toHaveLength(1);
    expect(getPreset("macro", first.id)?.payload.equity).toBe(-20);
  });

  it("keeps macro and mc scopes isolated", () => {
    savePreset("macro", "Stress", { equity: -10, ratesBps: 50, creditBps: 100, oil: 0, gold: 0, usd: 0 });
    savePreset("mc", "Retirement", { initial: 10000, monthly: 500, years: 30, target: 1_000_000, mean: 0.07, sd: 0.15, runs: 800, confidences: [0.95, 0.99] });
    expect(listPresets("macro")).toHaveLength(1);
    expect(listPresets("mc")).toHaveLength(1);
  });

  it("deletes a preset by id", () => {
    const p = savePreset("mc", "A", { initial: 1000, monthly: 100, years: 10, target: 50000, mean: 0.06, sd: 0.12, runs: 500, confidences: [0.95] });
    expect(listPresets("mc")).toHaveLength(1);
    deletePreset("mc", p.id);
    expect(listPresets("mc")).toHaveLength(0);
  });

  it("uses 'Untitled preset' when an empty name is supplied", () => {
    const p = savePreset("macro", "   ", { equity: 0, ratesBps: 0, creditBps: 0, oil: 0, gold: 0, usd: 0 });
    expect(p.name).toBe("Untitled preset");
  });
});