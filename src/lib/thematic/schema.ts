import { z } from "zod";

export const ExposureTier = z.enum(["pure-play", "partial", "adjacent"]);
export type ExposureTier = z.infer<typeof ExposureTier>;

export const ChainSegmentKey = z.enum([
  "raw_materials",
  "components",
  "manufacturers",
  "distributors",
  "end_users",
]);
export type ChainSegmentKey = z.infer<typeof ChainSegmentKey>;

export const RegionKey = z.enum(["all", "na", "eu", "asia"]);
export type RegionKey = z.infer<typeof RegionKey>;

export const SizeBand = z.enum(["all", "large", "mid", "small"]);
export type SizeBand = z.infer<typeof SizeBand>;

export const CompanyCandidate = z.object({
  symbol: z.string(),
  segment: ChainSegmentKey,
  exposure: ExposureTier,
  thesis: z.string().optional(),
});
export type CompanyCandidate = z.infer<typeof CompanyCandidate>;

export const RankedCompany = z.object({
  symbol: z.string(),
  name: z.string(),
  segment: ChainSegmentKey,
  exposure: ExposureTier,
  thesis: z.string().optional(),
  region: z.enum(["na", "eu", "asia", "other"]).optional(),
  marketCap: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().optional(),
  pe: z.number().nullable().optional(),
  revGrowth: z.number().nullable().optional(),
  sentiment: z.number().nullable().optional(),
  score: z.number(),
  discovery: z.boolean().optional(),
});
export type RankedCompany = z.infer<typeof RankedCompany>;

export const ThematicResultSchema = z.object({
  theme: z.string(),
  region: RegionKey,
  size: SizeBand,
  discoveryMode: z.boolean(),
  chain: z.array(
    z.object({
      segment: ChainSegmentKey,
      label: z.string(),
      companies: z.array(
        z.object({
          symbol: z.string(),
          name: z.string().optional(),
          exposure: ExposureTier,
          thesis: z.string().optional(),
        }),
      ),
    }),
  ),
  results: z.array(RankedCompany),
  sources: z
    .array(z.object({ label: z.string(), url: z.string().optional() }))
    .optional(),
  cached: z.boolean().optional(),
  generated_at: z.string(),
});
export type ThematicResult = z.infer<typeof ThematicResultSchema>;

export const SEGMENT_LABELS: Record<ChainSegmentKey, string> = {
  raw_materials: "Raw materials",
  components: "Components",
  manufacturers: "Manufacturers",
  distributors: "Distributors & integrators",
  end_users: "End users",
};

export const THEME_PRESETS: Array<{ id: string; label: string; hint: string }> = [
  { id: "ai-infra", label: "AI infrastructure", hint: "GPUs, HBM, power, cooling" },
  { id: "glp1", label: "GLP-1 drugs", hint: "Obesity & diabetes value chain" },
  { id: "defence-electronics", label: "Defence electronics", hint: "Radar, EW, missile guidance" },
  { id: "uranium-nuclear", label: "Nuclear & uranium", hint: "SMR, enrichment, mining" },
  { id: "grid-transmission", label: "Grid & transmission", hint: "T&D, transformers, HVDC" },
  { id: "cybersecurity", label: "Cybersecurity", hint: "Cloud sec, SIEM, identity" },
  { id: "cloud-data", label: "Cloud data platforms", hint: "Warehouses, streaming, ML" },
  { id: "robotics", label: "Robotics & automation", hint: "Industrial, humanoids" },
  { id: "space", label: "Space economy", hint: "Launch, satellites, comms" },
  { id: "ev-supply", label: "EV supply chain", hint: "Batteries, materials, magnets" },
  { id: "gene-therapy", label: "Gene & cell therapy", hint: "CRISPR, oncology, delivery" },
  { id: "quantum", label: "Quantum computing", hint: "Hardware, cryo, software" },
];