import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy, MessageSquarePlus, Loader2, RefreshCw } from "lucide-react";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { listMyTickets, STATUS_LABEL, STATUS_TONE, type SupportTicket } from "@/lib/supportTickets";
import { toast } from "sonner";

export function SupportCard() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setTickets(await listMyTickets(10)); }
    catch (e) { toast.error("Could not load tickets", { description: (e as Error).message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Support & feedback</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
            <MessageSquarePlus className="h-3.5 w-3.5" /> Send feedback
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Report a bug, request a feature, or send feedback. We respond to every ticket.
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
          No tickets yet. Use <strong>Send feedback</strong> above to open your first one.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {tickets.map((t) => (
            <li key={t.id} className="py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium truncate">{t.subject}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.message}</p>
                {t.admin_reply && (
                  <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                    <span className="font-medium text-primary">Reply: </span>{t.admin_reply}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(t.created_at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FeedbackDialog open={open} onOpenChange={setOpen} source="settings" onSubmitted={load} />
    </Card>
  );
}