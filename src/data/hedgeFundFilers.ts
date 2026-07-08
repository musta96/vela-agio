/** Curated list of well-known 13F filers. CIKs are SEC-assigned integers. */
export interface HedgeFundFiler {
  cik: string;
  name: string;
  manager?: string;
  style?: string;
}

export const HEDGE_FUND_FILERS: HedgeFundFiler[] = [
  { cik: "1067983", name: "Berkshire Hathaway", manager: "Warren Buffett", style: "Value / Quality" },
  { cik: "1336528", name: "Pershing Square Capital", manager: "Bill Ackman", style: "Activist / Concentrated" },
  { cik: "1649339", name: "Scion Asset Management", manager: "Michael Burry", style: "Deep Value / Contrarian" },
  { cik: "1656456", name: "Tiger Global Management", manager: "Chase Coleman", style: "Growth / Tech" },
  { cik: "1037389", name: "Renaissance Technologies", manager: "Jim Simons est.", style: "Quant / Systematic" },
  { cik: "1061768", name: "Baupost Group", manager: "Seth Klarman", style: "Value / Special Situations" },
  { cik: "1040273", name: "Third Point", manager: "Dan Loeb", style: "Event-Driven / Activist" },
  { cik: "1656333", name: "Appaloosa Management", manager: "David Tepper", style: "Global Macro / Distressed" },
  { cik: "1350694", name: "Bridgewater Associates", manager: "Ray Dalio (founder)", style: "Global Macro / Risk Parity" },
  { cik: "1112520", name: "Duquesne Family Office", manager: "Stanley Druckenmiller", style: "Global Macro" },
  { cik: "1364742", name: "Blackrock Inc", manager: "Larry Fink", style: "Broad Passive + Active" },
  { cik: "1364730", name: "Citadel Advisors", manager: "Ken Griffin", style: "Multi-Strategy" },
];