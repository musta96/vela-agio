import { z } from "zod";

export const TimingDirection = z.enum(["buy", "wait", "avoid"]);
export type TimingDirection = z.infer<typeof TimingDirection>;

export const TimingSignalFamily = z.enum(["tech", "fund", "macro"]);
export type TimingSignalFamily = z.infer<typeof TimingSignalFamily>;

export const TimingSignalSchema = z.object({
  family: TimingSignalFamily,
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
  direction: TimingDirection,
  weight: z.number(),
  note: z.string().optional(),
});
export type TimingSignal = z.infer<typeof TimingSignalSchema>;

export const TimingSourceSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
  retrieved_at: z.string().optional(),
});
export type TimingSource = z.infer<typeof TimingSourceSchema>;

/** Upcoming catalyst / event that materially affects this ticker's entry window. */
export const TimingEventSchema = z.object({
  kind: z.enum(["earnings", "policy", "cpi", "dividend", "other"]),
  label: z.string(),
  date: z.string(), // ISO date
  daysUntil: z.number(),
  scope: z.enum(["ticker", "macro"]).optional(),
  note: z.string().optional(),
});
export type TimingEvent = z.infer<typeof TimingEventSchema>;

export const TimingResultSchema = z.object({
  symbol: z.string(),
  asOf: z.string(),
  verdict: TimingDirection,
  score: z.number(),
  headline: z.string(),
  signals: z.array(TimingSignalSchema),
  sources: z.array(TimingSourceSchema),
  events: z.array(TimingEventSchema).optional(),
});
export type TimingResult = z.infer<typeof TimingResultSchema>;