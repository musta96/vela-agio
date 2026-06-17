// Shared author metadata used in Article + Person JSON-LD across blog posts.
export const VELA_AUTHOR = {
  name: "Vela Research",
  url: "https://vela-agio.lovable.app/",
  jobTitle: "Markets Research Team",
  description:
    "Vela Research is the in-house markets team behind Vela, covering AI-driven stock research, portfolio analytics, and wealth-tracking tools for individual investors.",
} as const;

export function personSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: VELA_AUTHOR.name,
    url: VELA_AUTHOR.url,
    jobTitle: VELA_AUTHOR.jobTitle,
    description: VELA_AUTHOR.description,
    worksFor: { "@type": "Organization", name: "Vela", url: VELA_AUTHOR.url },
  };
}

export function authorRef() {
  return {
    "@type": "Person",
    name: VELA_AUTHOR.name,
    url: VELA_AUTHOR.url,
  };
}