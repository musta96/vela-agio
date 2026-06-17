import { useState } from "react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const Q_EN = [
  { title: "Investment horizon", sub: "When do you expect to need most of this money?", opts: [["⏳ <3y", 1], ["📅 3-7y", 2], ["🌱 7-15y", 3], ["🌳 >15y", 4]], why: "Horizon defines how much volatility you can absorb." },
  { title: "Reaction to a 20% drawdown", sub: "Markets occasionally fall hard. What's your honest reaction?", opts: [["😱 Sell all", 1], ["😟 Sell some", 2], ["🧘 Hold", 3], ["🤑 Buy more", 4]], why: "Behaviour matters more than theory - we tune alerts to your nerves." },
  { title: "Experience with markets", sub: "Be honest - we adapt explanations to your level. You can change this later.", opts: [["🌱 None", 1], ["📈 Some ETFs", 2], ["🎯 Active investor", 3], ["🎓 Professional", 4]], why: "Experience adjusts how much jargon we use, which signals we surface, and the default complexity of the Risk Engine." },
  { title: "Income stability", sub: "How predictable is your cash inflow?", opts: [["🎲 Variable", 1], ["💼 Stable", 3], ["🏦 Very stable + savings", 4]], why: "Stable income lets you tolerate equity drawdowns more comfortably." },
  { title: "Primary goal", sub: "What do you ultimately want from this portfolio?", opts: [["🛡️ Capital preservation", 1], ["💵 Income", 2], ["⚖️ Balanced growth", 3], ["🚀 Aggressive growth", 4]], why: "Goal anchors the model portfolio we propose." },
] as const;
const Q_IT = [
  { title: "Orizzonte di investimento", sub: "Quando prevedi di usare la maggior parte di questi soldi?", opts: [["⏳ <3 anni", 1], ["📅 3-7 anni", 2], ["🌱 7-15 anni", 3], ["🌳 >15 anni", 4]], why: "L'orizzonte definisce quanta volatilità puoi assorbire." },
  { title: "Reazione a un drawdown del 20%", sub: "I mercati a volte crollano. Qual è la tua reazione onesta?", opts: [["😱 Vendo tutto", 1], ["😟 Vendo in parte", 2], ["🧘 Tengo", 3], ["🤑 Compro ancora", 4]], why: "Il comportamento conta più della teoria." },
  { title: "Esperienza con i mercati", sub: "Sii onesto - adattiamo le spiegazioni al tuo livello. Puoi cambiarla in futuro.", opts: [["🌱 Nessuna", 1], ["📈 Qualche ETF", 2], ["🎯 Investitore attivo", 3], ["🎓 Professionista", 4]], why: "L'esperienza regola il livello di gergo e i segnali mostrati." },
  { title: "Stabilità del reddito", sub: "Quanto è prevedibile il tuo flusso di cassa?", opts: [["🎲 Variabile", 1], ["💼 Stabile", 3], ["🏦 Molto stabile + risparmi", 4]], why: "Un reddito stabile permette di tollerare drawdown azionari." },
  { title: "Obiettivo principale", sub: "Cosa vuoi davvero da questo portafoglio?", opts: [["🛡️ Preservazione capitale", 1], ["💵 Reddito", 2], ["⚖️ Crescita bilanciata", 3], ["🚀 Crescita aggressiva", 4]], why: "L'obiettivo ancora il portafoglio modello che proponiamo." },
] as const;

const PORTFOLIOS_EN = {
  conservative: { name: "Conservative", weights: { Bonds: 60, "Global Equity": 25, Gold: 10, Cash: 5 } },
  balanced: { name: "Balanced", weights: { "Global Equity": 50, Bonds: 35, "Real Estate": 10, Gold: 5 } },
  growth: { name: "Growth", weights: { "Global Equity": 70, "Emerging Markets": 15, Bonds: 10, Crypto: 5 } },
  aggressive: { name: "Aggressive", weights: { "Global Equity": 60, "Emerging Markets": 20, "Thematic / AI": 15, Crypto: 5 } },
};
const PORTFOLIOS_IT = {
  conservative: { name: "Conservativo", weights: { "Obbligazioni": 60, "Azionario Globale": 25, "Oro": 10, "Liquidità": 5 } },
  balanced: { name: "Bilanciato", weights: { "Azionario Globale": 50, "Obbligazioni": 35, "Immobiliare": 10, "Oro": 5 } },
  growth: { name: "Crescita", weights: { "Azionario Globale": 70, "Mercati Emergenti": 15, "Obbligazioni": 10, "Cripto": 5 } },
  aggressive: { name: "Aggressivo", weights: { "Azionario Globale": 60, "Mercati Emergenti": 20, "Tematico / AI": 15, "Cripto": 5 } },
};

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const Q = i18n.resolvedLanguage === "it" ? Q_IT : Q_EN;
  const PORTFOLIOS = i18n.resolvedLanguage === "it" ? PORTFOLIOS_IT : PORTFOLIOS_EN;
  const [ans, setAns] = useState<number[]>(Array(Q.length).fill(0));
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const score = ans.reduce((s, v) => s + v, 0);
  const bucket = score < 10 ? "conservative" : score < 14 ? "balanced" : score < 18 ? "growth" : "aggressive";
  const profile = PORTFOLIOS[bucket as keyof typeof PORTFOLIOS];
  const partialScore = ans.reduce((s, v) => s + v, 0);
  const maxScore = Q.length * 4;
  const liveBucket = partialScore < 10 ? "conservative" : partialScore < 14 ? "balanced" : partialScore < 18 ? "growth" : "aggressive";
  const liveProfile = PORTFOLIOS[liveBucket as keyof typeof PORTFOLIOS];
  const tolerancePct = Math.min(100, (partialScore / maxScore) * 100);
  const bucketLetter = liveBucket === "conservative" ? "C" : liveBucket === "balanced" ? "B" : liveBucket === "growth" ? "G" : "A";
  const bucketBlurb = liveBucket === "conservative" ? "Capital first · short horizon" : liveBucket === "balanced" ? "Mid-horizon · moderate risk" : liveBucket === "growth" ? "Long horizon · growth tilt" : "High conviction · long horizon";
  const cur = Q[step];

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <SEO title="Onboarding | Vela.ai" description="Risk profile and model portfolio" path="/onboarding" />
      {/* Hero header with progress */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight leading-tight">Build your investor profile</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">Five quick questions. We'll use them to tune Vela's signals, screens and risk views.</p>
          </div>
        </div>
        {!done && (
          <Button variant="outline" size="sm" onClick={() => setDone(true)} disabled={ans.some(v => !v)}>Skip for now</Button>
        )}
      </div>

      {/* Progress bar - 5 segments */}
      {!done && (
        <div className="grid grid-cols-5 gap-2">
          {Q.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Main step card */}
        <div className="col-span-12 lg:col-span-8 bg-card border border-border rounded-2xl p-8">
          {!done ? (
            <div className="space-y-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Step {step + 1} of {Q.length}</div>
                <h2 className="text-2xl font-bold tracking-tight mt-2">{cur.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{cur.sub}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {cur.opts.map(([label, v]) => {
                  const selected = ans[step] === v;
                  return (
                    <button
                      key={label as string}
                      onClick={() => setAns(a => { const c = [...a]; c[step] = v as number; return c; })}
                      className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${selected ? "bg-sidebar-background text-sidebar-foreground border-sidebar-background" : "bg-card border-border hover:border-primary/40"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Why we ask:</span> {cur.why}</p>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
                </Button>
                {step < Q.length - 1 ? (
                  <Button onClick={() => setStep(s => s + 1)} disabled={!ans[step]}>
                    Continue <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                ) : (
                  <Button onClick={() => setDone(true)} disabled={ans.some(v => !v)}>
                    {t("pages.onboarding.see")} <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight">{profile.name}</h2>
              <p className="text-sm text-muted-foreground">{t("pages.onboarding.score")}: {score}/{maxScore}</p>
              {Object.entries(profile.weights).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v}%</span></div>
                  <div className="h-2 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{ width: `${v}%` }} /></div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-4">{t("pages.onboarding.indicative")}</p>
              <Button onClick={() => { setDone(false); setStep(0); setAns(Array(Q.length).fill(0)); }} variant="outline">{t("pages.onboarding.retake")}</Button>
            </div>
          )}
        </div>

        {/* Right rail - live profile preview */}
        <div className="col-span-12 lg:col-span-4 bg-card border border-border rounded-2xl p-6 h-fit space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Your profile preview</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase tracking-wider">live</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
              {bucketLetter}
            </div>
            <div>
              <div className="text-base font-bold">{profile.name}</div>
              <div className="text-xs text-muted-foreground">{bucketBlurb}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Risk tolerance</div>
            <div className="relative h-2 rounded-full overflow-hidden bg-muted">
              <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(var(--success)), hsl(38 92% 50%), hsl(var(--destructive)))" }} />
              <div className="absolute top-1/2 -translate-y-1/2 h-3 w-1 bg-foreground rounded-full" style={{ left: `${tolerancePct}%` }} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Suggested allocation</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {Object.entries(liveProfile.weights).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-muted-foreground truncate">{k}</span><span className="font-semibold tabular-nums">{v}%</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}