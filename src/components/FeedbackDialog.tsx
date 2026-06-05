import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { submitTicket, type TicketCategory, type TicketSource } from "@/lib/supportTickets";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source?: TicketSource;
  defaultCategory?: TicketCategory;
  contextMessage?: string;
  onSubmitted?: (id: string) => void;
}

export function FeedbackDialog({ open, onOpenChange, source = "settings", defaultCategory = "feedback", contextMessage, onSubmitted }: Props) {
  const [category, setCategory] = useState<TicketCategory>(defaultCategory);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(contextMessage ?? "");
  const [busy, setBusy] = useState(false);

  const reset = () => { setSubject(""); setMessage(""); setCategory(defaultCategory); };

  const submit = async () => {
    if (subject.trim().length < 3) return toast.error("Add a short subject (3+ chars).");
    if (message.trim().length < 5) return toast.error("Add a few words of detail (5+ chars).");
    setBusy(true);
    try {
      const { id } = await submitTicket({ subject: subject.trim(), message: message.trim(), category, source });
      toast.success("Thanks — we got your ticket", { description: "You can track it in Settings → Support." });
      reset();
      onOpenChange(false);
      onSubmitted?.(id);
    } catch (e) {
      toast.error("Could not send", { description: (e as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>Bug, idea, or question — we read every one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Short summary" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                <SelectTrigger className="min-w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature request</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={6} placeholder="What happened, what did you expect, and where?" />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{message.length} / 5000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}