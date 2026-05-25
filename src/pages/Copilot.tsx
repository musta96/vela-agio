import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, Send, User as UserIcon, Loader2, Wrench, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";

type ToolEvent = { id: string; name: string; args?: any; result?: any; done: boolean };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolEvent[] };

export default function Copilot() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: t("pages.copilot.intro") }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<{ portfolio: any[]; watchlist: any[] }>({ portfolio: [], watchlist: [] });
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    setInput(""); setBusy(true);
    const next = [...messages, { role: "user", content: text } as Msg];
    setMessages(next);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${SUPABASE_URL}/functions/v1/copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ messages: next, portfolio: ctx.portfolio, watchlist: ctx.watchlist, lang: i18n.resolvedLanguage }),
      });
      if (!r.ok || !r.body) throw new Error("Stream failed");
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let acc = ""; let buf = ""; const tools: ToolEvent[] = [];
      setMessages(m => [...m, { role: "assistant", content: "", tools: [] }]);
      const pushUpdate = () => setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: acc, tools: [...tools] }; return c; });
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        // SSE events are separated by blank line — parse event blocks
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
              const existing = tools.find(t => t.id === j.id);
              if (j.phase === "start") {
                if (!existing) tools.push({ id: j.id, name: j.name, args: j.args, done: false });
              } else if (j.phase === "end") {
                if (existing) { existing.result = j.result; existing.done = true; }
                else tools.push({ id: j.id, name: j.name, result: j.result, done: true });
              }
              pushUpdate();
            } catch {}
          } else {
            // default 'message' event — OpenAI-style delta
            if (data === "[DONE]") continue;
            try { const j = JSON.parse(data); const delta = j?.choices?.[0]?.delta?.content; if (delta) { acc += delta; pushUpdate(); } } catch {}
          }
        }
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="AI Copilot | Vela.ai" description="Chat with your portfolio-aware investment copilot" path="/copilot" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 flex-1 flex flex-col max-w-4xl w-full">
        <div className="flex items-center gap-3 mb-4"><Bot className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.copilot.title")}</h1></div>
        <Card className="flex-1 flex flex-col min-h-[60vh]">
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && <Bot className="h-6 w-6 text-primary shrink-0" />}
                <div className={`max-w-[80%] space-y-2 ${m.role === "user" ? "items-end" : ""}`}>
                  {m.tools && m.tools.length > 0 && (
                    <div className="space-y-1">
                      {m.tools.map(t => (
                        <details key={t.id} className="rounded-md border border-border bg-card/50 text-xs">
                          <summary className="flex items-center gap-2 px-2 py-1 cursor-pointer list-none">
                            <Wrench className={`h-3 w-3 ${t.done ? "text-primary" : "text-muted-foreground animate-pulse"}`} />
                            <span className="font-mono">{t.name}</span>
                            {!t.done && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            {t.done && t.result?.error && <span className="text-destructive">· error</span>}
                            {t.done && t.result?.ok && <span className="text-primary">· ok</span>}
                            <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
                          </summary>
                          <div className="px-2 pb-2 space-y-1">
                            {t.args && <pre className="text-[10px] opacity-70 overflow-x-auto">{JSON.stringify(t.args, null, 2)}</pre>}
                            {t.done && <pre className="text-[10px] opacity-80 overflow-x-auto">{JSON.stringify(t.result, null, 2).slice(0, 1500)}</pre>}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                  <div className={`rounded-lg px-4 py-2 prose prose-sm prose-invert ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <ReactMarkdown>{m.content || (m.tools && m.tools.length > 0 ? "_working..._" : "...")}</ReactMarkdown>
                  </div>
                </div>
                {m.role === "user" && <UserIcon className="h-6 w-6 text-muted-foreground shrink-0" />}
              </div>
            ))}
            <div ref={endRef} />
          </CardContent>
          <div className="border-t p-4 flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={t("pages.copilot.placeholder")} disabled={busy} />
            <Button onClick={send} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </div>
        </Card>
      </main>
    </div>
  );
}