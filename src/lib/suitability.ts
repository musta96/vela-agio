/**
 * MiFID II suitability — single source of truth for scoring, profile mapping,
 * SRI (1–7) and target allocation. Imported by both the questionnaire page
 * and the Settings summary card so the two surfaces can never disagree.
 *
 * The module is intentionally pure: `computeSuitability(answers)` is a
 * deterministic function of its input. All clamping happens here.
 */

export type SuitabilityOption = { label: string; score: number };
export type SuitabilityQuestion = {
  key: string;
  q: string;
  help?: string;
  opts: SuitabilityOption[];
};
export type SuitabilitySection = {
  id: string;
  title: string;
  description: string;
  questions: SuitabilityQuestion[];
};

export const SECTIONS: SuitabilitySection[] = [
  {
    id: "knowledge",
    title: "1. Knowledge & Experience",
    description: "MiFID II appropriateness — your familiarity with financial instruments.",
    questions: [
      { key: "edu", q: "Highest finance/economics education", opts: [
        { label: "None", score: 0 },
        { label: "Self-taught / books & courses", score: 1 },
        { label: "University-level economics or finance", score: 2 },
        { label: "Postgraduate / professional (CFA, ACCA, etc.)", score: 3 },
      ]},
      { key: "knowledge", q: "Overall investment knowledge", opts: [
        { label: "None", score: 0 },
        { label: "Basic (savings, term deposits)", score: 1 },
        { label: "Good (stocks, ETFs, bonds)", score: 2 },
        { label: "Expert (derivatives, structured products)", score: 3 },
      ]},
      { key: "experience", q: "How long have you actively invested?", opts: [
        { label: "Never", score: 0 },
        { label: "< 2 years", score: 1 },
        { label: "2-5 years", score: 2 },
        { label: "5+ years", score: 3 },
      ]},
      { key: "frequency", q: "Average number of trades per year", opts: [
        { label: "0", score: 0 },
        { label: "1-10", score: 1 },
        { label: "11-50", score: 2 },
        { label: "50+", score: 3 },
      ]},
    ],
  },
  {
    id: "financial",
    title: "2. Financial Situation",
    description: "Your capacity to bear losses (MiFID II Art. 25).",
    questions: [
      { key: "income", q: "Liquid savings vs annual income", opts: [
        { label: "< 3 months", score: 0 },
        { label: "3-6 months", score: 1 },
        { label: "6-12 months", score: 2 },
        { label: "12+ months", score: 3 },
      ]},
      { key: "debt", q: "Debt-to-income ratio", opts: [
        { label: "> 50%", score: 0 },
        { label: "30-50%", score: 1 },
        { label: "10-30%", score: 2 },
        { label: "< 10% or none", score: 3 },
      ]},
      { key: "share", q: "% of net worth you can invest at risk", opts: [
        { label: "< 10%", score: 0 },
        { label: "10-25%", score: 1 },
        { label: "25-50%", score: 2 },
        { label: "> 50%", score: 3 },
      ]},
    ],
  },
  {
    id: "objectives",
    title: "3. Investment Objectives & Horizon",
    description: "What you want from your portfolio.",
    questions: [
      { key: "horizon", q: "Investment horizon", opts: [
        { label: "< 1 year", score: 0 },
        { label: "1-3 years", score: 1 },
        { label: "3-7 years", score: 2 },
        { label: "7+ years", score: 3 },
      ]},
      { key: "goal", q: "Primary objective", opts: [
        { label: "Capital preservation", score: 0 },
        { label: "Regular income", score: 1 },
        { label: "Balanced growth", score: 2 },
        { label: "Aggressive growth", score: 3 },
      ]},
    ],
  },
  {
    id: "risk",
    title: "4. Risk Tolerance",
    description: "Behavioural reaction to losses.",
    questions: [
      { key: "loss", q: "If your portfolio dropped 20% in a month you would…", opts: [
        { label: "Sell everything", score: 0 },
        { label: "Sell part, worry", score: 1 },
        { label: "Hold calmly", score: 2 },
        { label: "Buy more", score: 3 },
      ]},
      { key: "volatility", q: "Acceptable annual volatility", opts: [
        { label: "Very low (< 5%)", score: 0 },
        { label: "Low (5-10%)", score: 1 },
        { label: "Medium (10-20%)", score: 2 },
        { label: "High (> 20%)", score: 3 },
      ]},
    ],
  },
];

export const TOTAL_QUESTIONS = SECTIONS.reduce((n, s) => n + s.questions.length, 0);
/** Sum of the highest option score across every question. */
export const MAX_SCORE = SECTIONS.reduce(
  (n, s) => n + s.questions.reduce((m, q) => m + Math.max(...q.opts.map((o) => o.score)), 0),
  0,
);

export type ProfileDef = {
  name: "Conservative" | "Moderate" | "Balanced" | "Dynamic" | "Aggressive";
  min: number;
  max: number;
  sri: number; // 1-7 (SFDR/PRIIPs scale)
  allocation: string;
  desc: string;
};

/**
 * Five contiguous buckets that span [0, MAX_SCORE]. Tuned so that all-min
 * answers map to Conservative/SRI 1 and all-max answers map to
 * Aggressive/SRI 7. Edit thresholds here if MAX_SCORE changes.
 */
export const PROFILES: ProfileDef[] = [
  { name: "Conservative", min: 0,  max: 6,  sri: 1, allocation: "20% equities / 70% bonds / 10% cash", desc: "Capital preservation, low volatility." },
  { name: "Moderate",     min: 7,  max: 13, sri: 3, allocation: "40% equities / 55% bonds / 5% cash",  desc: "Income with modest growth." },
  { name: "Balanced",     min: 14, max: 20, sri: 4, allocation: "60% equities / 35% bonds / 5% cash",  desc: "Balanced long-term growth." },
  { name: "Dynamic",      min: 21, max: 27, sri: 6, allocation: "75% equities / 22% bonds / 3% cash",  desc: "Growth-tilted, higher volatility." },
  { name: "Aggressive",   min: 28, max: MAX_SCORE, sri: 7, allocation: "90% equities / 8% bonds / 2% cash + thematic tilts", desc: "Maximum growth, high volatility tolerance." },
];

const CORE_KEYS = new Set<string>(
  SECTIONS.flatMap((s) => s.questions.map((q) => q.key)),
);

/**
 * Strip any non-core, non-numeric or `__`-prefixed fields and clamp values to
 * the valid option range for each question. Returns a clean `{key: score}`
 * object that is safe to score.
 */
export function sanitizeAnswers(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const s of SECTIONS) {
    for (const q of s.questions) {
      const v = raw[q.key];
      if (typeof v !== "number" || !isFinite(v)) continue;
      const min = Math.min(...q.opts.map((o) => o.score));
      const max = Math.max(...q.opts.map((o) => o.score));
      out[q.key] = Math.max(min, Math.min(max, Math.round(v)));
    }
  }
  return out;
}

export type SuitabilityResult = {
  /** Raw answer map after sanitisation — only core questions, clamped. */
  answers: Record<string, number>;
  /** Sum of clamped answer scores, always in `[0, MAX_SCORE]`. */
  score: number;
  maxScore: number;
  answeredCount: number;
  totalQuestions: number;
  /** 0–100 inclusive. */
  completionPct: number;
  profile: ProfileDef;
  /** Convenience mirror of `profile.sri`. */
  sri: number;
  /** Convenience mirror of `profile.allocation`. */
  allocation: string;
  /** True iff every core question has been answered exactly once. */
  complete: boolean;
};

export function computeSuitability(rawAnswers: Record<string, unknown> | null | undefined): SuitabilityResult {
  const answers = sanitizeAnswers(rawAnswers);
  const rawScore = Object.entries(answers)
    .filter(([k]) => CORE_KEYS.has(k))
    .reduce((sum, [, v]) => sum + v, 0);
  const score = Math.max(0, Math.min(MAX_SCORE, rawScore));
  const answeredCount = Math.min(Object.keys(answers).length, TOTAL_QUESTIONS);
  const completionPct = Math.max(0, Math.min(100, Math.round((answeredCount / TOTAL_QUESTIONS) * 100)));
  const profile =
    PROFILES.find((p) => score >= p.min && score <= p.max) ?? PROFILES[0];
  return {
    answers,
    score,
    maxScore: MAX_SCORE,
    answeredCount,
    totalQuestions: TOTAL_QUESTIONS,
    completionPct,
    profile,
    sri: profile.sri,
    allocation: profile.allocation,
    complete: answeredCount === TOTAL_QUESTIONS,
  };
}

/** Format helper used by both pages: `"23 / 33"`. */
export function formatScore(score: number, max: number = MAX_SCORE): string {
  const clamped = Math.max(0, Math.min(max, Math.round(score)));
  return `${clamped} / ${max}`;
}