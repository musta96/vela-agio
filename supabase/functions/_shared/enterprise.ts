/**
 * Shared Enterprise provisioning.
 *
 * Called from the Stripe webhook once a payment is *verified* (an active,
 * paid Enterprise subscription), so a firm that pays self-serve does not
 * need a manual approval click. It is idempotent: re-running it for the
 * same owner reuses the existing firm and owner seat.
 */

type Db = {
  from: (table: string) => any;
};

const DEFAULT_SEAT_LIMIT = 3;

export async function provisionEnterpriseFirm(
  db: Db,
  ownerId: string,
  opts: { source: string } = { source: "stripe_payment" },
): Promise<{ firmId: string | null; created: boolean; leadId: string | null }> {
  if (!ownerId) return { firmId: null, created: false, leadId: null };

  // Match a submitted Enterprise lead so the firm inherits its company name
  // and the admin approval queue stops showing an already-paid applicant.
  const { data: lead } = await db
    .from("enterprise_leads")
    .select("id,company,status")
    .eq("user_id", ownerId)
    .neq("status", "converted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let { data: firm } = await db
    .from("enterprise_firms").select("id").eq("owner_user_id", ownerId).maybeSingle();

  let created = false;
  if (!firm) {
    const insert: Record<string, unknown> = { owner_user_id: ownerId, seat_limit: DEFAULT_SEAT_LIMIT };
    if (lead?.company) insert.name = String(lead.company).slice(0, 120);
    const { data: newFirm, error } = await db
      .from("enterprise_firms").insert(insert).select("id").maybeSingle();
    if (error || !newFirm) {
      console.error("[enterprise] firm provisioning failed", error?.message);
      return { firmId: null, created: false, leadId: lead?.id ?? null };
    }
    firm = newFirm;
    created = true;
  }

  await db.from("enterprise_memberships").upsert(
    { firm_id: firm.id, user_id: ownerId, role: "firm_admin" },
    { onConflict: "firm_id,user_id" },
  );

  if (lead?.id) {
    await db.from("enterprise_leads").update({ status: "converted" }).eq("id", lead.id);
  }

  await db.from("audit_log").insert({
    actor_id: ownerId,
    action: "enterprise.firm.auto_provisioned",
    entity: "enterprise_firms",
    entity_id: firm.id,
    payload: { source: opts.source, lead_id: lead?.id ?? null, created },
  });

  return { firmId: firm.id, created, leadId: lead?.id ?? null };
}
