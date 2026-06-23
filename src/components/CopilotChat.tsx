import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, Send, User as UserIcon, Loader2, Wrench, ChevronRight, Paperclip, X, Image as ImageIcon, MessageSquarePlus, FileDown, Plus, Trash2, MessageSquare, Search, BrainCircuit, FileText, Activity, ShieldAlert, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { downloadTextAsPdf, userWantsPdf, downloadBilingualConversationAsPdf } from "@/lib/copilotPdf";
import { generateInvestmentMemo, type InvestmentMemoData } from "@/lib/investmentMemoPdf";
import { generatePortfolioMemo, type GeneratePortfolioMemoOptions } from "@/lib/generatePortfolioMemo";
import { downloadMemoCsvBundle } from "@/lib/portfolioMemoData";
import { AiCreditsBadge } from "@/components/AiCreditsBadge";
import { useAiCredits } from "@/hooks/useAiCredits";
import { Link } from "react-router-dom";

const MEMORY_KEY = "vela.ai_memory_enabled";

type ToolEvent = { id: string; name: string; args?: any; result?: any; done: boolean };
type Attachment = { name: string; mime: string; dataUrl: string };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolEvent[]; attachments?: Attachment[] };
type Thread = { id: string; title: string; updated_at: string };

async function fileToDataUrl(f: File): Promise<Attachment> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, mime: f.type || "application/octet-stream", dataUrl: String(r.result) });
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export function CopilotChat({ compact = false, initialIntro, showThreads = true }: { compact?: boolean; initialIntro?: string; showThreads?: boolean }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const intro = initialIntro ?? t("pages.copilot.intro");
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: intro }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [ctx, setCtx] = useState<{ portfolio: any[]; watchlist: any[] }>({ portfolio: [], watchlist: [] });
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState("");
  const [memoryOn, setMemoryOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(MEMORY_KEY);
    return v === null ? true : v === "1";
  });
  const [exporting, setExporting] = useState(false);
  const { exhausted, hasCap, remaining, limit, unlimited } = useAiCredits();

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(MEMORY_KEY, memoryOn ? "1" : "0");
  }, [memoryOn]);

  const lastUser = [...messages].reverse().find(m => m.role === "user")?.content ?? "";

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: w }] = await Promise.all([
        supabase.from("portfolio_holdings").select("symbol,name,shares,avg_price").eq("user_id", user.id),
        supabase.from("watchlist_items").select("symbol,name").eq("user_id", user.id),
      ]);
      setCtx({ portfolio: p ?? [], watchlist: w ?? [] });
    })();
  }, [user]);

  // Load thread list and the most recent thread's messages
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("copilot_threads")
        .select("id,title,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      const list = (data ?? []) as Thread[];
      setThreads(list);
      if (memoryOn && list[0]) await openThread(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openThread = useCallback(async (id: string) => {
    setThreadId(id);
    const { data } = await (supabase as any)
      .from("copilot_messages")
      .select("role,content")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as { role: Msg["role"]; content: string }[];
    if (rows.length === 0) {
      setMessages([{ role: "assistant", content: intro }]);
    } else {
      setMessages(rows.map(r => ({ role: r.role, content: r.content })));
    }
  }, [intro]);

  const ensureThread = useCallback(async (firstUserMsg: string): Promise<string | null> => {
    if (!user || !memoryOn) return null;
    if (threadId) return threadId;
    const title = firstUserMsg.trim().slice(0, 60) || "New conversation";
    const { data, error } = await (supabase as any)
      .from("copilot_threads")
      .insert({ user_id: user.id, title })
      .select("id,title,updated_at")
      .single();
    if (error || !data) return null;
    setThreadId(data.id);
    setThreads(prev => [data as Thread, ...prev]);
    return data.id;
  }, [user, threadId, memoryOn]);

  const newThread = () => {
    setThreadId(null);
    setMessages([{ role: "assistant", content: intro }]);
    setAttachments([]);
    setInput("");
  };

  const deleteThread = async (id: string) => {
    await (supabase as any).from("copilot_threads").delete().eq("id", id);
    setThreads(prev => prev.filter(t => t.id !== id));
    if (threadId === id) newThread();
  };

  const deleteAllThreads = async () => {
    if (!user) return;
    if (!confirm("Delete ALL saved conversations? This cannot be undone.")) return;
    await (supabase as any).from("copilot_threads").delete().eq("user_id", user.id);
    setThreads([]);
    newThread();
  };

  const exportConversationPdf = async () => {
    const convo = messages.filter(m => (m.role === "user" || m.role === "assistant") && m.content?.trim());
    if (convo.length === 0) return;
    setExporting(true);
    try {
      const src = (i18n.resolvedLanguage || "en").toLowerCase().startsWith("it") ? "it" : "en";
      await downloadBilingualConversationAsPdf(
        convo.map(m => ({ role: m.role, content: m.content })),
        `vela-conversation-${new Date().toISOString().slice(0,10)}.pdf`,
        src as "en" | "it",
      );
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 5)) {
      if (f.size > 8 * 1024 * 1024) continue;
      next.push(await fileToDataUrl(f));
    }
    setAttachments(a => [...a, ...next].slice(0, 5));
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    setInput(""); setBusy(true);
    const userMsg: Msg = { role: "user", content: text || "(see attachments)", attachments };
    const next = [...messages, userMsg];
    setMessages(next);
    const sentAttachments = attachments;
    setAttachments([]);
    const wantsPdf = userWantsPdf(text);
    const tid = memoryOn ? await ensureThread(text) : null;
    if (tid && user && memoryOn) {
      await (supabase as any).from("copilot_messages").insert({
        thread_id: tid, user_id: user.id, role: "user", content: userMsg.content,
      });
    }
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const pageContext = `route=${pathname} title=${document.title}`;
      const r = await fetch(`${SUPABASE_URL}/functions/v1/copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          attachments: sentAttachments,
          pageContext,
          portfolio: ctx.portfolio,
          watchlist: ctx.watchlist,
          lang: i18n.resolvedLanguage,
        }),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => null);
        throw new Error(payload?.reason || payload?.error || "The AI request failed.");
      }
      if (!r.body) throw new Error("Stream failed");
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let acc = ""; let buf = ""; const tools: ToolEvent[] = [];
      setMessages(m => [...m, { role: "assistant", content: "", tools: [] }]);
      const pushUpdate = () => setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: acc, tools: [...tools] }; return c; });
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n"); buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const lines = block.split("\n");
          let evt = "message"; const dataLines: string[] = [];
          for (const ln of lines) {
            if (ln.startsWith("event:")) evt = ln.slice(6).trim();
            else if (ln.startsWith("data:")) dataLines.push(ln.slice(5).trim());
          }
          const data = dataLines.join("\n");
          if (!data) continue;
          if (evt === "tool") {
            try {
              const j = JSON.parse(data);
              const existing = tools.find(x => x.id === j.id);
              if (j.phase === "start") { if (!existing) tools.push({ id: j.id, name: j.name, args: j.args, done: false }); }
              else if (j.phase === "end") {
                if (existing) { existing.result = j.result; existing.done = true; }
                else tools.push({ id: j.id, name: j.name, result: j.result, done: true });
              }
              pushUpdate();
            } catch {}
          } else {
            if (data === "[DONE]") continue;
            try { const j = JSON.parse(data); const delta = j?.choices?.[0]?.delta?.content; if (delta) { acc += delta; pushUpdate(); } } catch {}
          }
        }
      }
      // Persist the assistant reply and auto-trigger PDF when asked
      if (tid && user && memoryOn && acc) {
        await (supabase as any).from("copilot_messages").insert({
          thread_id: tid, user_id: user.id, role: "assistant", content: acc,
        });
        await (supabase as any).from("copilot_threads").update({ updated_at: new Date().toISOString() }).eq("id", tid);
      }
      if (wantsPdf && acc) {
        try { downloadTextAsPdf(acc, `vela-${new Date().toISOString().slice(0,10)}.pdf`, text.slice(0, 80)); } catch {}
      }
    } catch (e: any) {
      // User-facing fallback only. Raw error is logged for monitoring.
      console.error("[copilot] stream failed", e);
      const message = typeof e?.message === "string" ? e.message : "";
      const isActionable = /AI|provider|quota|key|credits|billing|Privacy settings|Upgrade|Settings/i.test(message) && !message.includes("Stream failed");
      setMessages(m => [
        ...m,
        {
          role: "assistant",
          content: isActionable
            ? message
            : "The AI copilot is temporarily unavailable. Your data is unaffected - please try again in a moment.",
        },
      ]);
    } finally { setBusy(false); }
  };

  return (
    <div className={`flex h-full min-h-0 ${compact ? "" : ""}`}>
      {showThreads && user && (
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
          <div className="p-2 border-b border-border space-y-2">
            <Button size="sm" variant="outline" className="w-full gap-2" onClick={newThread}>
              <Plus className="h-3.5 w-3.5" /> New chat
            </Button>
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground px-1">
              <span className="inline-flex items-center gap-1"><BrainCircuit className="h-3 w-3" /> AI memory</span>
              <input
                type="checkbox"
                checked={memoryOn}
                onChange={(e) => setMemoryOn(e.target.checked)}
                aria-label="Toggle AI memory"
              />
            </label>
            <div className="relative">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={threadFilter}
                onChange={(e) => setThreadFilter(e.target.value)}
                placeholder="Search conversations…"
                className="h-7 text-xs pl-6"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
            {threads.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3">No saved conversations yet.</p>
            ) : null}
            {threads
              .filter(th => th.title.toLowerCase().includes(threadFilter.trim().toLowerCase()))
              .map(th => (
              <div
                key={th.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/60 ${threadId === th.id ? "bg-muted" : ""}`}
                onClick={() => openThread(th.id)}
              >
                <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{th.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteThread(th.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          {threads.length > 0 && (
            <div className="p-2 border-t border-border">
              <button
                onClick={deleteAllThreads}
                className="w-full text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center justify-center gap-1"
              >
                <Trash2 className="h-3 w-3" /> Delete all conversations
              </button>
            </div>
          )}
        </aside>
      )}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <AiCreditsBadge />
        {messages.filter(m => m.role === "assistant" || m.role === "user").length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px]"
            disabled={exporting}
            onClick={exportConversationPdf}
            title="Download the full conversation as a PDF (English + Italian)"
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
            PDF (EN + IT)
          </Button>
        ) : <span />}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <Bot className="h-5 w-5 text-primary shrink-0 mt-1" />}
            <div className="max-w-[85%] space-y-2">
              {m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {m.attachments.map((a, idx) => a.mime.startsWith("image/")
                    ? <img key={idx} src={a.dataUrl} alt={`Attached image: ${a.name}`} className="h-16 rounded border border-border" />
                    : <span key={idx} className="text-[10px] px-2 py-1 rounded bg-muted">{a.name}</span>)}
                </div>
              )}
              {m.tools && m.tools.length > 0 && (
                <div className="space-y-1">
                  {m.tools.map(tl => (
                    tl.name === "generate_investment_memo" && tl.done && tl.result?.memo ? (
                      <MemoArtifactCard key={tl.id} memo={tl.result.memo as InvestmentMemoData} />
                    ) : tl.name === "run_portfolio_simulation" && tl.done && tl.result?.summary ? (
                      <SimulationArtifactCard key={tl.id} result={tl.result} />
                    ) : tl.name === "generate_portfolio_memo" && tl.done && tl.result?.memo ? (
                      <PortfolioMemoArtifactCard
                        key={tl.id}
                        memo={tl.result.memo as GeneratePortfolioMemoOptions}
                        normalisationNote={tl.result.normalisationNote}
                      />
                    ) : (
                    <details key={tl.id} className="rounded-md border border-border bg-card/50 text-xs">
                      <summary className="flex items-center gap-2 px-2 py-1 cursor-pointer list-none">
                        <Wrench className={`h-3 w-3 ${tl.done ? "text-primary" : "text-muted-foreground animate-pulse"}`} />
                        <span className="font-mono">{tl.name}</span>
                        {!tl.done && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {tl.done && tl.result?.error && <span className="text-destructive">· error</span>}
                        {tl.done && tl.result?.ok && <span className="text-primary">· ok</span>}
                        <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
                      </summary>
                      <div className="px-2 pb-2 space-y-1">
                        {tl.args && <pre className="text-[10px] opacity-70 overflow-x-auto">{JSON.stringify(tl.args, null, 2)}</pre>}
                        {tl.done && <pre className="text-[10px] opacity-80 overflow-x-auto">{JSON.stringify(tl.result, null, 2).slice(0, 1500)}</pre>}
                      </div>
                    </details>
                    )
                  ))}
                </div>
              )}
              <div className={`rounded-lg px-3 py-2 prose prose-sm max-w-none ${m.role === "user" ? "prose-invert bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                <ReactMarkdown>{m.content || (m.tools && m.tools.length > 0 ? "_working..._" : "...")}</ReactMarkdown>
              </div>
              {m.role === "assistant" && m.content && i > 0 && (
                <div className="flex justify-start">
                  <button
                    onClick={() => downloadTextAsPdf(m.content, `vela-${new Date().toISOString().slice(0,10)}.pdf`)}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    title="Download this answer as PDF"
                  >
                    <FileDown className="h-3 w-3" /> Download as PDF
                  </button>
                </div>
              )}
            </div>
            {m.role === "user" && <UserIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {attachments.length > 0 && (
        <div className="border-t px-3 py-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={i} className="relative">
              {a.mime.startsWith("image/")
                ? <img src={a.dataUrl} alt={`Attached image: ${a.name}`} className="h-12 rounded border border-border" />
                : <span className="text-xs px-2 py-1 rounded bg-muted inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" />{a.name}</span>}
              <button onClick={() => setAttachments(att => att.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 bg-background border border-border rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t p-3 flex gap-2 items-center">
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.txt,.md,.csv" className="hidden" onChange={e => onPickFiles(e.target.files)} />
        <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={busy || exhausted} title="Attach screenshot or file">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setFeedbackOpen(true)} disabled={busy} title="Send feedback to the team" aria-label="Send feedback">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex flex-col">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={exhausted ? "AI credits exhausted — upgrade or add a BYO key" : t("pages.copilot.placeholder")}
            disabled={busy || exhausted}
          />
          {hasCap && !unlimited && (
            <div className={`text-[10px] mt-1 px-1 ${exhausted ? "text-destructive" : (remaining ?? 0) <= Math.max(5, Math.round((limit as number) * 0.2)) ? "text-warning" : "text-muted-foreground"}`}>
              {exhausted ? (
                <>0 AI credits left. <Link to="/pricing" className="underline">Upgrade</Link> or <Link to="/settings?tab=Connections" className="underline">add your key</Link>. Paper trading still works.</>
              ) : (
                <>{remaining} AI credits left this month · <Link to="/ai-usage" className="underline">view usage</Link></>
              )}
            </div>
          )}
        </div>
        <Button onClick={send} disabled={busy || exhausted} size="icon" title={exhausted ? "AI credits exhausted" : "Send"}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        source="helper_bot"
        defaultCategory="feedback"
        contextMessage={lastUser ? `From helper bot. Last user message:\n\n"${lastUser.slice(0, 500)}"\n\n- My feedback -\n` : ""}
      />
      </div>
    </div>
  );
}

export default CopilotChat;

function MemoArtifactCard({ memo }: { memo: InvestmentMemoData }) {
  const reco = (memo.recommendation ?? "hold").toString().toLowerCase();
  const tone =
    reco === "buy" || reco === "accumulate" ? "bg-bull/15 text-bull border-bull/30"
    : reco === "sell" || reco === "reduce" ? "bg-bear/15 text-bear border-bear/30"
    : "bg-muted text-muted-foreground border-border";
  const target = typeof memo.targetPrice === "number"
    ? `${memo.currency ?? ""} ${memo.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : "—";
  const onDownload = () => {
    try { generateInvestmentMemo(memo); } catch (e) { console.error("[memo] pdf failed", e); }
  };
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Investment Memo</div>
          <div className="font-semibold truncate">{memo.name} <span className="font-mono text-muted-foreground">· {memo.symbol}</span></div>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider rounded px-2 py-0.5 border ${tone}`}>{reco}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div className="text-muted-foreground">Target</div><div className="font-mono font-medium">{target}</div></div>
        <div><div className="text-muted-foreground">Horizon</div><div className="font-medium">{memo.horizon ?? "12m"}</div></div>
        <div><div className="text-muted-foreground">Conviction</div><div className="font-medium capitalize">{memo.conviction ?? "—"}</div></div>
      </div>
      <Button size="sm" variant="default" className="w-full gap-1.5 h-8" onClick={onDownload}>
        <FileDown className="h-3.5 w-3.5" /> Download memo PDF
      </Button>
    </div>
  );
}

function SimulationArtifactCard({ result }: { result: any }) {
  const s = result?.summary ?? {};
  const href: string | undefined = result?.ui?.href;
  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
    return `$${Math.round(v)}`;
  };
  const pct = (v: number, d = 1) => Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—";
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" /> Portfolio Simulation
          </div>
          <div className="font-semibold truncate">
            {(s.symbols ?? []).join(" · ")}{" "}
            <span className="font-mono text-muted-foreground">· {s.horizonYears}y · {s.runs?.toLocaleString?.()} paths</span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider rounded px-2 py-0.5 border bg-primary/10 text-primary border-primary/30">
          {pct(s.annualizedReturnPct)} CAGR
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div className="text-muted-foreground">Expected</div><div className="font-mono font-medium">{fmt(s.expected)}</div></div>
        <div><div className="text-muted-foreground">Median</div><div className="font-mono font-medium">{fmt(s.median)}</div></div>
        <div><div className="text-muted-foreground">Sharpe</div><div className="font-mono font-medium">{Number.isFinite(s.sharpe) ? s.sharpe.toFixed(2) : "—"}</div></div>
        <div><div className="text-muted-foreground">P5</div><div className="font-mono font-medium">{fmt(s.p05)}</div></div>
        <div><div className="text-muted-foreground">P95</div><div className="font-mono font-medium">{fmt(s.p95)}</div></div>
        <div><div className="text-muted-foreground">P(loss)</div><div className="font-mono font-medium">{pct(s.probLoss)}</div></div>
        <div className="col-span-3 grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-border/60">
          <div>
            <div className="text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-bear" /> VaR 95% / 99%</div>
            <div className="font-mono font-medium text-bear">{fmt(s.var95)} / {fmt(s.var99)}</div>
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-bear" /> CVaR 95% / 99%</div>
            <div className="font-mono font-medium text-bear">{fmt(s.cvar95)} / {fmt(s.cvar99)}</div>
          </div>
        </div>
      </div>
      {href && (
        <Link to={href}>
          <Button size="sm" variant="default" className="w-full gap-1.5 h-8">
            Open full simulation <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}