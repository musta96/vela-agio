import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";

export type ProgressToolEvent = { id: string; name: string; result?: any; done: boolean; startedAt?: number; endedAt?: number };

export type PhaseId = "fetch" | "simulate" | "synthesize";

const PHASE_ORDER: PhaseId[] = ["fetch", "simulate", "synthesize"];

/** Map a tool name to the analysis phase it belongs to. */
export function phaseForTool(name: string): PhaseId {
  const n = name.toLowerCase();
  if (/(memo|report|pdf|export|ticket|note|save|draft|summar)/.test(n)) return "synthesize";
  if (/(simulat|backtest|monte|optimi|sensitiv|walk_forward|scenario|compare|analy|regulatory|technical|risk)/.test(n)) return "simulate";
  return "fetch";
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Real-time milestone strip for a Copilot turn: shows which analysis phase is
 * running, which tools completed, and how long each took — instead of the
 * assistant looping "please stand by" notices.
 */
export function AnalysisProgress({ tools, busy }: { tools: ProgressToolEvent[]; busy: boolean }) {
  const { t } = useTranslation();
  const [, tick] = useState(0);

  // Re-render once a second so running timers advance.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => tick(x => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  if (tools.length === 0) return null;

  const byPhase = PHASE_ORDER.map(id => {
    const items = tools.filter(x => phaseForTool(x.name) === id);
    const running = items.some(x => !x.done);
    const failed = items.some(x => x.done && x.result?.error);
    return { id, items, running, failed, done: items.length > 0 && !running };
  });

  const activeIdx = byPhase.findIndex(p => p.running);
  const completed = tools.filter(x => x.done).length;

  return (
    <div className="rounded-lg border border-border bg-card/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{t("copilot.progress.title")}</span>
        <span>{t("copilot.progress.steps", { done: completed, total: tools.length })}</span>
      </div>

      <ol className="space-y-1.5">
        {byPhase.map((p, idx) => {
          const pending = p.items.length === 0 && (activeIdx === -1 ? !busy : idx > activeIdx);
          return (
            <li key={p.id} className="text-[11px]">
              <div className="flex items-center gap-2">
                {p.failed ? (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                ) : p.running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                ) : p.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <span className={pending ? "text-muted-foreground/70" : "text-foreground"}>
                  {t(`copilot.progress.phase.${p.id}`)}
                </span>
                {p.items.length > 0 && (
                  <span className="text-muted-foreground">
                    · {p.items.filter(x => x.done).length}/{p.items.length}
                  </span>
                )}
              </div>
              {p.items.length > 0 && (
                <ul className="mt-0.5 ml-5 space-y-0.5">
                  {p.items.map(x => {
                    const elapsed = (x.endedAt ?? Date.now()) - (x.startedAt ?? Date.now());
                    return (
                      <li key={x.id} className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px]">
                        {x.done
                          ? (x.result?.error ? <AlertCircle className="h-3 w-3 text-destructive" /> : <CheckCircle2 className="h-3 w-3 text-success" />)
                          : <Loader2 className="h-3 w-3 animate-spin" />}
                        <span className="truncate">{x.name}</span>
                        {x.startedAt && <span className="opacity-70">{fmtElapsed(elapsed)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
