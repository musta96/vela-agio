import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Calculator, Download, RotateCcw, ArrowLeft, ArrowUpRight } from "lucide-react";
import VelaLogo from "@/components/VelaLogo";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { calculatePac, DEFAULT_PAC_INPUTS, PAC_BOUNDS, type PacInputs } from "@/lib/investorCalculator";

const money = (value: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const fields: { key: keyof PacInputs; label: string; unit: string; step: number }[] = [
  { key: "initial", label: "Capitale iniziale", unit: "€", step: 100 },
  { key: "monthly", label: "Versamento mensile", unit: "€", step: 25 },
  { key: "years", label: "Durata", unit: "anni", step: 1 },
  { key: "annualReturn", label: "Rendimento annuo ipotizzato", unit: "%", step: 0.5 },
  { key: "annualCost", label: "Costi annui ipotizzati", unit: "%", step: 0.05 },
  { key: "inflation", label: "Inflazione annua ipotizzata", unit: "%", step: 0.5 },
];
const faq = [
  { q: "Che cos'è un PAC?", a: "Un piano di accumulo del capitale prevede versamenti periodici in uno o più strumenti. Distribuisce gli acquisti nel tempo, ma non elimina il rischio di perdita e non garantisce un rendimento." },
  { q: "Quanto versare ogni mese?", a: "La cifra dipende da reddito, spese, fondo di emergenza, debiti e obiettivi. Prima di investire, separa il denaro che potrebbe servirti nel breve periodo. Il calcolatore non consiglia una cifra né un prodotto." },
  { q: "Il risultato comprende le imposte italiane?", a: "No. Gli importi sono prima delle imposte. La tassazione dipende dallo strumento, dalla residenza fiscale e dal regime applicabile. Non sono incluse imposta di bollo, IVAFE, commissioni per ordine o cambi valutari. Verifica il trattamento con l'intermediario o un professionista." },
  { q: "Un PAC in ETF è senza rischi?", a: "No. Anche un ETF diversificato può perdere valore. Controlla indice, composizione, valuta, liquidità, costi e KID. La sigla UCITS indica un quadro regolamentare, non una garanzia del capitale." },
];

export default function InvestorCalculator() {
  const [values, setValues] = useState<Record<keyof PacInputs, string>>(() => Object.fromEntries(Object.entries(DEFAULT_PAC_INPUTS).map(([k, v]) => [k, String(v)])) as Record<keyof PacInputs, string>);
  const calculation = useMemo(() => {
    try {
      if (Object.values(values).some(v => v.trim() === "")) return null;
      return calculatePac(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) as PacInputs);
    } catch { return null; }
  }, [values]);
  const reset = () => setValues(Object.fromEntries(Object.entries(DEFAULT_PAC_INPUTS).map(([k, v]) => [k, String(v)])) as Record<keyof PacInputs, string>);
  const download = () => {
    if (!calculation) return;
    const decimal = (v: number) => new Intl.NumberFormat("it-IT", { useGrouping: false, maximumFractionDigits: 2 }).format(v);
    const csv = ["Simulazione PAC illustrativa - prima delle imposte", ...fields.map(f => `${f.label};${values[f.key]};${f.unit}`), "Versamenti a fine mese; rendimento costante; costi proporzionali annui", "Anno;Versato EUR;Valore nominale EUR;Valore in euro di oggi", ...calculation.points.map(p => [p.year, decimal(p.contributed), decimal(p.nominal), decimal(p.real)].join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "vela-simulazione-pac.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return <div lang="it" className="min-h-screen bg-background text-foreground">
    <SEO title="Calcolatore PAC gratuito e guida per investitori italiani | Vela" description="Simula un piano di accumulo in euro: capitale iniziale, versamenti mensili, interesse composto, costi e inflazione. Guida italiana gratuita, senza registrazione." path="/calcolatore-pac" />
    <Helmet><meta property="og:type" content="website" /><meta name="twitter:card" content="summary" />
      <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "WebApplication", name: "Vela - Calcolatore PAC", inLanguage: "it-IT", applicationCategory: "FinanceApplication", operatingSystem: "Web", url: "https://vela-agio.lovable.app/calcolatore-pac", offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" } })}</script>
      <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) })}</script>
    </Helmet>
    <header className="border-b border-border"><nav aria-label="Navigazione" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <Link to="/" aria-label="Vela, homepage"><VelaLogo size={30} /></Link>
      <div className="flex items-center gap-2"><Button variant="ghost" asChild><Link to="/blog">Blog</Link></Button><Button variant="outline" asChild><a href="#guida">Guida al PAC</a></Button></div>
    </nav></header>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-7 max-w-3xl"><p className="flex items-center gap-2 text-sm font-medium text-primary"><Calculator className="h-4 w-4" /> Gratuito · senza registrazione</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Calcolatore PAC</h1>
        <p className="mt-3 text-base text-muted-foreground">Quanto potrebbe crescere un piano di accumulo? Confronta il capitale versato con una simulazione in euro, tenendo conto di costi e inflazione.</p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-label="Ipotesi del PAC" className="min-w-0 rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Le tue ipotesi</h2><Button variant="ghost" size="icon" aria-label="Ripristina esempio" title="Ripristina esempio" onClick={reset}><RotateCcw className="h-4 w-4" /></Button></div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">{fields.map(f => {
            const n = Number(values[f.key]); const [min, max] = PAC_BOUNDS[f.key];
            const invalid = values[f.key] === "" || !Number.isFinite(n) || n < min || n > max || (f.key === "years" && !Number.isInteger(n));
            return <div key={f.key} className="min-w-0"><Label className="text-sm" htmlFor={`pac-${f.key}`}>{f.label}</Label>
              <div className="relative mt-1.5"><Input id={`pac-${f.key}`} type="number" inputMode="decimal" min={min} max={max} step={f.step} value={values[f.key]} aria-invalid={invalid} aria-describedby={invalid ? `pac-error-${f.key}` : undefined} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className="pr-12" /><span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">{f.unit}</span></div>
              {invalid && <p id={`pac-error-${f.key}`} className="mt-1 text-xs text-destructive">Da {min} a {max}{f.key === "years" ? ", anni interi" : ""}.</p>}
            </div>;
          })}</div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">I valori iniziali sono un esempio, non una previsione. Nessun dato viene inviato o salvato.</p>
        </section>
        <section aria-label="Risultati della simulazione" className="min-w-0">
          {calculation ? <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-5">
              {[{ label: "Capitale finale ipotizzato", value: calculation.nominal }, { label: "Totale versato", value: calculation.contributed }, { label: "Guadagno / perdita nominale", value: calculation.gain }, { label: "Valore in euro di oggi", value: calculation.real }].map((m, i) => <div key={m.label} className="min-w-0"><p className="text-xs text-muted-foreground">{m.label}</p><p className={`mt-1 break-words text-xl font-semibold sm:text-2xl ${i === 0 ? "text-primary" : "text-foreground"}`}>{money(m.value)}</p></div>)}
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs text-muted-foreground"><span>Valore nominale e capitale versato</span><span>Prima delle imposte</span></div>
            <ChartContainer className="mt-3 h-64 w-full sm:h-80" config={{ nominal: { label: "Capitale nominale", color: "hsl(var(--primary))" }, contributed: { label: "Versato", color: "hsl(var(--muted-foreground))" } }}>
              <AreaChart data={calculation.points} margin={{ left: 0, right: 8, top: 10, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="year" tickLine={false} axisLine={false} tickFormatter={v => `${v} a`} /><YAxis width={55} tickLine={false} axisLine={false} tickFormatter={v => new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(v)} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={v => `Anno ${v}`} formatter={(v, name) => <span>{name === "nominal" ? "Capitale" : "Versato"}: {money(Number(v))}</span>} />} />
                <Area type="monotone" dataKey="nominal" stroke="var(--color-nominal)" fill="var(--color-nominal)" fillOpacity={0.12} isAnimationActive={false} />
                <Area type="monotone" dataKey="contributed" stroke="var(--color-contributed)" fill="var(--color-contributed)" fillOpacity={0.04} isAnimationActive={false} />
              </AreaChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Rendimento annuo dopo i costi: {new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(calculation.netAnnualReturn)}%</p><Button variant="outline" size="sm" onClick={download} className="gap-2"><Download className="h-4 w-4" /> Scarica CSV</Button></div>
          </> : <p role="alert" className="py-12 text-sm text-destructive">Controlla i valori evidenziati per ottenere la simulazione.</p>}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Simulazione deterministica: rendimento costante e versamenti a fine mese. Nella realtà i rendimenti oscillano e la sequenza delle perdite conta. Il capitale non è garantito.</p>
        </section>
      </div>
      <article id="guida" className="mt-12 scroll-mt-6 border-t border-border pt-8">
        <p className="text-sm font-medium text-primary">Guida per investitori italiani</p><h2 className="mt-2 text-2xl font-semibold">Prima di iniziare un piano di accumulo</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <section><h3 className="font-semibold">1. Obiettivo e orizzonte</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Definisci quando ti servirà il denaro e quale perdita potresti sostenere. Un orizzonte lungo non rende sicuro un investimento. Mantieni separata una riserva per gli imprevisti.</p></section>
          <section><h3 className="font-semibold">2. Strumenti, diversificazione e KID</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Per un PAC in ETF, confronta l'indice seguito, l'esposizione geografica e settoriale, la valuta e la politica di distribuzione. Leggi il KID, il documento con informazioni chiave su rischi, costi e scenari. Non scegliere solo dal rendimento passato.</p></section>
          <section><h3 className="font-semibold">3. Costi e potere d'acquisto</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">I costi riducono il risultato composto. Qui i costi annui si applicano in modo proporzionale al valore del portafoglio. Inserisci un rendimento prima dei costi: sottrarli di nuovo da una performance già netta li conterebbe due volte. L'inflazione riduce il potere d'acquisto del capitale finale.</p></section>
          <section><h3 className="font-semibold">4. Fiscalità e intermediario</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Per chi è fiscalmente residente in Italia, regime amministrato e dichiarativo comportano obblighi diversi. Un intermediario estero può richiedere adempimenti dichiarativi. Verifica imposte, bollo o IVAFE, compensazione delle perdite e documentazione prima di aprire il conto.</p></section>
        </div>
        <details className="mt-8 border-y border-border py-4"><summary className="cursor-pointer text-sm font-semibold">Metodo di calcolo e limiti</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Il fattore annuo netto è (1 + rendimento/100) × (1 − costi/100). Il fattore mensile è la sua radice dodicesima. Ogni mese il capitale precedente viene moltiplicato per questo fattore e poi si aggiunge il versamento. Il valore reale è il capitale finale diviso per (1 + inflazione/100) elevato agli anni. Sono esclusi imposte, commissioni per ordine, spread, cambi, sospensioni dei versamenti e volatilità. Gli importi visualizzati sono arrotondati, il calcolo mantiene la precisione completa.</p></details>
        <h2 className="mt-8 text-xl font-semibold">Domande frequenti</h2><div className="mt-3">{faq.map(f => <details key={f.q} className="border-b border-border py-4"><summary className="cursor-pointer text-sm font-semibold">{f.q}</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p></details>)}</div>
        <section className="mt-8"><h2 className="text-lg font-semibold">Fonti istituzionali per approfondire</h2><ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm text-primary">{[{ label: "CONSOB: educazione finanziaria", href: "https://www.consob.it/web/investor-education" }, { label: "Banca d'Italia: L'economia per tutti", href: "https://economiapertutti.bancaditalia.it/" }, { label: "Agenzia delle Entrate", href: "https://www.agenziaentrate.gov.it/" }].map(s => <li key={s.href}><a className="inline-flex items-center gap-1 underline underline-offset-4" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}<ArrowUpRight className="h-3.5 w-3.5" /></a></li>)}</ul></section>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Contenuto educativo, non consulenza finanziaria o fiscale. Nessuna raccomandazione di acquisto. Le regole fiscali possono cambiare; consulta le fonti ufficiali e un professionista per la tua situazione.</p>
      </article>
    </main>
    <footer className="border-t border-border"><div className="mx-auto flex max-w-6xl flex-wrap gap-5 px-4 py-6 text-sm text-muted-foreground sm:px-6"><Link className="inline-flex items-center gap-2" to="/"><ArrowLeft className="h-4 w-4" /> Vela</Link><Link to="/blog">Blog</Link><Link to="/privacy">Privacy</Link><Link to="/disclaimer">Avvertenze</Link></div></footer>
  </div>;
}