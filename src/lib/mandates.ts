import { supabase } from "@/integrations/supabase/client";

export type ClientRole = "principal" | "family_view" | "advisor_ro" | "accountant" | "broker_ro";
export type MandateScope = "portfolio_read" | "net_worth_read" | "full";
export type MandateAction = "grant" | "revoke" | "view" | "switch_context" | "export_pdf" | "update_scope";

export const CLIENT_ROLE_LABEL: Record<ClientRole, string> = {
  principal: "Principal / Owner",
  family_view: "Family - view only",
  advisor_ro: "Advisor - read only",
  accountant: "Accountant - tax views",
  broker_ro: "Broker - read only aggregation",
};

/** Append-only audit row. Best-effort; failures only surface via console. */
export async function logMandateEvent(opts: {
  actorId: string;
  clientId: string;
  action: MandateAction;
  scope?: MandateScope | null;
  clientRole?: ClientRole | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("mandate_audit").insert({
    actor_id: opts.actorId,
    client_id: opts.clientId,
    action: opts.action,
    scope: opts.scope ?? null,
    client_role: opts.clientRole ?? null,
    metadata: (opts.metadata ?? {}) as any,
  });
  if (error) console.warn("[mandate audit] insert failed", error.message);
}

/** Returns true when the actor still has at least one non-revoked, non-expired mandate covering scope. */
export async function hasActiveMandate(
  actorId: string,
  clientId: string,
  scope: MandateScope = "portfolio_read",
): Promise<boolean> {
  const { data } = await supabase
    .from("advisory_consents")
    .select("scope, expires_at")
    .eq("granted_to", actorId)
    .eq("user_id", clientId)
    .is("revoked_at", null);
  const now = Date.now();
  return (data ?? []).some(
    (r: any) =>
      (r.scope === scope || r.scope === "full") &&
      (!r.expires_at || new Date(r.expires_at).getTime() > now),
  );
}