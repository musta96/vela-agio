import { DEFAULT_SECTIONS, type LandingSectionRow } from "./landingDefaults";

export type LandingTemplate = {
  id: string;
  name: string;
  description: string;
  sections: LandingSectionRow[];
};

// SaaS - feature-led, social proof, FAQ
const saas: LandingSectionRow[] = DEFAULT_SECTIONS.map((s) => {
  if (s.key === "hero") return { ...s, content: { ...s.content,
    eyebrow: "New: AI workspace for teams",
    title: "Ship faster with one workspace.",
    titleAccent: "Built for modern SaaS teams.",
    subtitle: "One place to plan, build and measure - replacing five tools your team already pays for.",
  }};
  if (s.key === "stats") return { ...s, content: { items: [
    { k: "10k+", v: "Teams onboard" }, { k: "99.99%", v: "Uptime SLA" },
    { k: "<200ms", v: "P95 latency" }, { k: "SOC 2", v: "Type II certified" },
  ]}};
  return s;
});

// Trading / fintech - the current default
const trading: LandingSectionRow[] = DEFAULT_SECTIONS;

// Portfolio / personal brand
const portfolio: LandingSectionRow[] = [
  { key: "hero", kind: "hero", sort_order: 10, enabled: true, content: {
    eyebrow: "Independent designer & researcher",
    title: "Hi, I'm {{brand}}.",
    titleAccent: "I build calm products.",
    subtitle: "Selected work spanning product design, brand systems and market research for early-stage teams.",
    primaryCta: { label: "View work", href: "#features" },
    secondaryCta: { label: "Get in touch", href: "/auth" },
    note: "Currently accepting Q3 projects.",
    trust: [],
  }},
  { key: "features", kind: "features", sort_order: 30, enabled: true, content: {
    title: "Selected work", subtitle: "A few recent projects.",
    items: [
      { icon: "Sparkles", title: "Project A", desc: "Brand identity + product surface for a Series A fintech." },
      { icon: "LineChart", title: "Project B", desc: "Research synthesis and data viz for a public-health NGO." },
      { icon: "BookOpen", title: "Project C", desc: "End-to-end editorial system for a long-form publication." },
    ]
  }},
  { key: "cta", kind: "cta", sort_order: 90, enabled: true, content: {
    title: "Let's build something together",
    subtitle: "Send a short brief - I reply within two business days.",
    primaryCta: { label: "Email me", href: "mailto:hello@example.com" },
    secondaryCta: { label: "View résumé", href: "#" },
  }},
];

export const LANDING_TEMPLATES: LandingTemplate[] = [
  { id: "trading", name: "Trading / Fintech", description: "Current Vela.ai default - full feature grid, audiences, pricing, FAQ.", sections: trading },
  { id: "saas", name: "SaaS / Product", description: "Team-led messaging with social proof and FAQ, no audience split.", sections: saas },
  { id: "portfolio", name: "Personal portfolio", description: "Minimal: hero, selected work, contact CTA.", sections: portfolio },
];