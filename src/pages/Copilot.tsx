import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, Send, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

export default function Copilot() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "I'm your investment research copilot. I have read access to your portfolio and watchlist. Ask me about concentration risk, factor tilts, sector exposure, or specific names." },
  ]);
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
      const r = await fetch(`${SUPABASE_URL}/functions/v1/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
        body: JSON.stringify({ messages: next, portfolio: ctx.portfolio, watchlist: ctx.watchlist }),
      });
      if (!r.ok || !r.body) throw new Error("Stream failed");
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let acc = ""; let buf = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const ln of lines) {
          if (!ln.startsWith("data:")) continue;
          const data = ln.slice(5).trim(); if (data === "[DONE]") continue;
          try { const j = JSON.parse(data); const delta = j?.choices?.[0]?.delta?.content; if (delta) { acc += delta; setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: acc }; return c; }); } } catch {}
        }
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="AI Copilot | FTSE MIB Analytics" description="Chat with your portfolio-aware investment copilot" path="/copilot" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 flex-1 flex flex-col max-w-4xl w-full">
        <div className="flex items-center gap-3 mb-4"><Bot className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Research Copilot</h1></div>
        <Card className="flex-1 flex flex-col min-h-[60vh]">
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && <Bot className="h-6 w-6 text-primary shrink-0" />}
                <div className={`max-w-[80%] rounded-lg px-4 py-2 prose prose-sm prose-invert ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <ReactMarkdown>{m.content || "..."}</ReactMarkdown>
                </div>
                {m.role === "user" && <UserIcon className="h-6 w-6 text-muted-foreground shrink-0" />}
              </div>
            ))}
            <div ref={endRef} />
          </CardContent>
          <div className="border-t p-4 flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about your portfolio…" disabled={busy} />
            <Button onClick={send} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </div>
        </Card>
      </main>
    </div>
  );
}