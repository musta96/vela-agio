import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, Send, User as UserIcon, Loader2, Wrench, ChevronRight, Paperclip, X, Image as ImageIcon, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { FeedbackDialog } from "@/components/FeedbackDialog";

type ToolEvent = { id: string; name: string; args?: any; result?: any; done: boolean };
type Attachment = { name: string; mime: string; dataUrl: string };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolEvent[]; attachments?: Attachment[] };

async function fileToDataUrl(f: File): Promise<Attachment> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, mime: f.type || "application/octet-stream", dataUrl: String(r.result) });
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export function CopilotChat({ compact = false, initialIntro }: { compact?: boolean; initialIntro?: string }) {
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
      if (!r.ok || !r.body) throw new Error("Stream failed");
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
    } catch (e: any) {
      // User-facing fallback only. Raw error is logged for monitoring.
      console.error("[copilot] stream failed", e);
      setMessages(m => [
        ...m,
        {
          role: "assistant",
          content:
            "The AI copilot is temporarily unavailable. Your data is unaffected — please try again in a moment.",
        },
      ]);
    } finally { setBusy(false); }
  };

  return (
    <div className={`flex flex-col h-full min-h-0 ${compact ? "" : ""}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <Bot className="h-5 w-5 text-primary shrink-0 mt-1" />}
            <div className="max-w-[85%] space-y-2">
              {m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {m.attachments.map((a, idx) => a.mime.startsWith("image/")
                    ? <img key={idx} src={a.dataUrl} alt={a.name} className="h-16 rounded border border-border" />
                    : <span key={idx} className="text-[10px] px-2 py-1 rounded bg-muted">{a.name}</span>)}
                </div>
              )}
              {m.tools && m.tools.length > 0 && (
                <div className="space-y-1">
                  {m.tools.map(tl => (
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
                  ))}
                </div>
              )}
              <div className={`rounded-lg px-3 py-2 prose prose-sm max-w-none ${m.role === "user" ? "prose-invert bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                <ReactMarkdown>{m.content || (m.tools && m.tools.length > 0 ? "_working..._" : "...")}</ReactMarkdown>
              </div>
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
                ? <img src={a.dataUrl} alt={a.name} className="h-12 rounded border border-border" />
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
        <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach screenshot or file">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setFeedbackOpen(true)} disabled={busy} title="Send feedback to the team" aria-label="Send feedback">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())} placeholder={t("pages.copilot.placeholder")} disabled={busy} />
        <Button onClick={send} disabled={busy} size="icon">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </div>
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        source="helper_bot"
        defaultCategory="feedback"
        contextMessage={lastUser ? `From helper bot. Last user message:\n\n"${lastUser.slice(0, 500)}"\n\n— My feedback —\n` : ""}
      />
    </div>
  );
}

export default CopilotChat;