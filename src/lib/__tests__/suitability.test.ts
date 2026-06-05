import { describe, it, expect } from "vitest";
import {
  SECTIONS,
  PROFILES,
  MAX_SCORE,
  TOTAL_QUESTIONS,
  computeSuitability,
  sanitizeAnswers,
} from "@/lib/suitability";

const allMin = () => {
  const a: Record<string, number> = {};
  for (const s of SECTIONS) for (const q of s.questions) a[q.key] = Math.min(...q.opts.map((o) => o.score));
  return a;
};
const allMax = () => {
  const a: Record<string, number> = {};
  for (const s of SECTIONS) for (const q of s.questions) a[q.key] = Math.max(...q.opts.map((o) => o.score));
  return a;
};

describe("computeSuitability", () => {
  it("all-min answers → Conservative / SRI 1 / score 0", () => {
    const r = computeSuitability(allMin());
    expect(r.score).toBe(0);
    expect(r.profile.name).toBe("Conservative");
    expect(r.sri).toBe(1);
    expect(r.completionPct).toBe(100);
    expect(r.complete).toBe(true);
  });

  it("all-max answers → Aggressive / SRI 7 / score === MAX_SCORE", () => {
    const r = computeSuitability(allMax());
    expect(r.score).toBe(MAX_SCORE);
    expect(r.profile.name).toBe("Aggressive");
    expect(r.sri).toBe(7);
  });

  it("score is always clamped to [0, MAX_SCORE] even if input is corrupt", () => {
    const bogus: Record<string, number> = {};
    for (const s of SECTIONS) for (const q of s.questions) bogus[q.key] = 99;
    const r = computeSuitability(bogus);
    expect(r.score).toBeLessThanOrEqual(MAX_SCORE);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("ignores __-prefixed and non-numeric extension fields", () => {
    const r = computeSuitability({
      ...allMax(),
      __maxSinglePositionPct: 25,
      __sfdrSustainableMinPct: 50,
      __sourceOfFunds: ["Salary"],
      __isPep: true,
    } as any);
    expect(r.answeredCount).toBe(TOTAL_QUESTIONS);
    expect(r.completionPct).toBe(100);
    expect(r.score).toBe(MAX_SCORE);
  });

  it("partial completion reports clamped %", () => {
    const half: Record<string, number> = {};
    const flat = SECTIONS.flatMap((s) => s.questions);
    flat.slice(0, Math.floor(flat.length / 2)).forEach((q) => (half[q.key] = 1));
    const r = computeSuitability(half);
    expect(r.answeredCount).toBeLessThanOrEqual(TOTAL_QUESTIONS);
    expect(r.completionPct).toBeLessThanOrEqual(100);
    expect(r.complete).toBe(false);
  });

  it("profile is monotonic with score", () => {
    const scores = [0, 5, 10, 15, 20, 25, 30, MAX_SCORE];
    const sris = scores.map((s) => {
      const p = PROFILES.find((p) => s >= p.min && s <= p.max)!;
      return p.sri;
    });
    for (let i = 1; i < sris.length; i++) expect(sris[i]).toBeGreaterThanOrEqual(sris[i - 1]);
  });

  it("PROFILES buckets cover [0, MAX_SCORE] contiguously", () => {
    const sorted = [...PROFILES].sort((a, b) => a.min - b.min);
    expect(sorted[0].min).toBe(0);
    expect(sorted[sorted.length - 1].max).toBe(MAX_SCORE);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
  });
});

describe("sanitizeAnswers", () => {
  it("drops unknown keys and clamps values to option range", () => {
    const a = sanitizeAnswers({ edu: 99, bogus: 1, knowledge: -5 } as any);
    expect(a.bogus).toBeUndefined();
    expect(a.edu).toBe(3);
    expect(a.knowledge).toBe(0);
  });
});