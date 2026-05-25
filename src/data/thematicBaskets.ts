export interface ThematicBasket {
  id: string;
  name: string;
  description: string;
  thesis: string;
  symbols: string[];
  tags: string[];
}

export const THEMATIC_BASKETS: ThematicBasket[] = [
  {
    id: "ai-megatrend",
    name: "AI Megatrend",
    description: "Chips, hyperscalers, picks-and-shovels.",
    thesis: "Generative AI capex super-cycle benefits the silicon stack, fabs, equipment makers and cloud infra.",
    symbols: ["NVDA", "AMD", "AVGO", "ASML.AS", "TSM", "MSFT", "GOOGL", "META", "ARM", "SMCI"],
    tags: ["AI", "Semis", "Cloud"],
  },
  {
    id: "eu-defense",
    name: "EU Defense & Rearmament",
    description: "European defense primes benefitting from rising budgets.",
    thesis: "NATO 2%+ floor and the war in Ukraine drive a multi-year rearmament cycle for EU primes.",
    symbols: ["LDO.MI", "AIR.PA", "HO.PA", "RHM.DE", "SAAB-B.ST", "BA.L"],
    tags: ["Defense", "EU", "Cyclical"],
  },
  {
    id: "italian-banks",
    name: "Italian Banks Income",
    description: "FTSE MIB banks distributing record capital.",
    thesis: "Higher-for-longer rates + clean balance sheets fuel 8-12% buyback + dividend yields.",
    symbols: ["ISP.MI", "UCG.MI", "MB.MI", "BAMI.MI", "BPE.MI", "BMED.MI", "FBK.MI"],
    tags: ["Banks", "Italy", "Income"],
  },
  {
    id: "energy-transition",
    name: "Energy Transition & Nuclear",
    description: "Utilities, grids, uranium, and renewables.",
    thesis: "Electrification + nuclear renaissance + grid capex create a structural demand story.",
    symbols: ["ENEL.MI", "TRN.MI", "SRG.MI", "PRY.MI", "NEE", "CEG", "URA", "ICLN"],
    tags: ["Utilities", "Nuclear", "Renewables"],
  },
  {
    id: "glp1-pharma",
    name: "GLP-1 & Obesity Pharma",
    description: "Anti-obesity blockbusters and the value chain.",
    thesis: "GLP-1 demand reshapes pharma; spillovers across food, devices, and CDMOs.",
    symbols: ["NVO", "LLY", "AMGN", "VKTX", "SAN.PA"],
    tags: ["Healthcare", "Biotech"],
  },
  {
    id: "luxury-europe",
    name: "European Luxury",
    description: "Best-in-class brands with pricing power.",
    thesis: "Aspirational demand + premiumization keep margins structurally high through cycles.",
    symbols: ["MC.PA", "RMS.PA", "KER.PA", "MONC.MI", "CFR.SW", "RACE.MI"],
    tags: ["Luxury", "EU", "Quality"],
  },
  {
    id: "ftse-mib-core",
    name: "FTSE MIB Core",
    description: "Italian large-cap broad exposure.",
    thesis: "Balanced sleeve to Italian blue chips across banks, energy, industrials, and consumer.",
    symbols: ["ENEL.MI", "ENI.MI", "ISP.MI", "UCG.MI", "STM.MI", "RACE.MI", "G.MI", "MC.PA"],
    tags: ["Italy", "Diversified"],
  },
  {
    id: "us-megacap",
    name: "US Megacap Quality",
    description: "Mag-7-style quality compounders.",
    thesis: "Dominant network effects, fortress balance sheets, AI optionality.",
    symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"],
    tags: ["US", "Quality", "Tech"],
  },
];