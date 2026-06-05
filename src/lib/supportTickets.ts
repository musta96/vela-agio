import { supabase } from "@/integrations/supabase/client";

export type TicketCategory = "bug" | "feature" | "question" | "feedback" | "other";
export type TicketSeverity = "low" | "normal" | "high" | "urgent";
export type TicketSource = "chat" | "settings" | "helper_bot" | "other";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  user_id: string;
  user_email: string | null;
  category: TicketCategory;
  severity: TicketSeverity;
  source: TicketSource;
  subject: string;
  message: string;
  page_url: string | null;
  status: TicketStatus;
  admin_reply: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitTicketInput {
  subject: string;
  message: string;
  category?: TicketCategory;
  severity?: TicketSeverity;
  source?: TicketSource;
  page_url?: string;
}

export async function submitTicket(input: SubmitTicketInput): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke("submit-ticket", {
    body: {
      ...input,
      page_url: input.page_url ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
    },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { id: string };
}

export async function listMyTickets(limit = 10): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SupportTicket[];
}

export async function listAllTickets(status?: TicketStatus): Promise<SupportTicket[]> {
  let q = supabase.from("support_tickets" as any).select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SupportTicket[];
}

export async function updateTicket(
  id: string,
  patch: Partial<Pick<SupportTicket, "status" | "admin_reply">> & { resolve?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.admin_reply !== undefined) update.admin_reply = patch.admin_reply;
  if (patch.resolve) {
    update.status = "resolved";
    update.resolved_at = new Date().toISOString();
  }
  const { error } = await supabase.from("support_tickets" as any).update(update).eq("id", id);
  if (error) throw error;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  in_progress: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  resolved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};