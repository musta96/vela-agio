# Vela — Security Report
_Last updated: 2026-06-05_

## Summary

| Status | Count |
|---|---|
| ✅ Fixed | 5 |
| ⚠️ Accepted (documented) | 2 |
| ℹ️ By-design (linter false-positive) | 5 |
| 🔴 Open | 0 |

---

## ✅ Fixed

### 1. Sensitive admin tables broadcast via Realtime (ERROR)
`audit_log` and `incident_log` were published to `supabase_realtime`, exposing actor emails, IPs, and incident payloads to any authenticated subscriber.

```sql
ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_log;
ALTER PUBLICATION supabase_realtime DROP TABLE public.incident_log;
```

### 2. Internal platform controls readable by every signed-in user (WARN)
`platform_controls` had `SELECT … USING (true)`, exposing kill-switches and operational flags.

```sql
DROP POLICY "Authenticated read controls" ON public.platform_controls;
CREATE POLICY "Admins read platform controls"
  ON public.platform_controls FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
```

### 3. Advisory consent scope bypass (WARN)
Clients could insert any string into `advisory_consents.scope`, including `'full'`, to widen access beyond what the UI exposed.

```sql
ALTER TABLE public.advisory_consents
  ADD CONSTRAINT advisory_consents_scope_check
  CHECK (scope IN ('portfolio_read','net_worth_read','orders_read','suitability_read','full'));
```

### 4. user_roles privilege-escalation defense-in-depth (WARN)
Only a permissive admin policy guarded role writes. Added a RESTRICTIVE policy so admin status is required even if other policies are misconfigured later.

```sql
CREATE POLICY "Only admins can write user_roles (restrictive)"
  ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
```

### 5. SECURITY DEFINER functions executable by anon (WARN)
Internal helpers were callable without authentication.

```sql
REVOKE EXECUTE ON FUNCTION public.handle_new_user()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_advisory_consent(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid,text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_usage_this_month(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_advisory_consent(uuid,uuid,text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_active_subscription(uuid,text)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ai_usage_this_month(uuid)    TO authenticated;
```

---

## ⚠️ Accepted (documented in security memory)

### A. `avatars` storage bucket is public (WARN)
Bucket is intentionally public so the app can render avatar `<img>` tags by URL without signed-URL round-trips. Path embeds the user UUID — non-sensitive (UUIDs are already used as JWT subjects). Fixing would require switching to signed URLs everywhere avatars are rendered.

### B. `landing_versions` has no SELECT policy (WARN)
Linter description itself says **"No action needed"**: RLS is enabled, no anon SELECT policy = implicit deny. The admin ALL policy is sufficient and intentional.

---

## ℹ️ By-design (linter cannot tell apart legitimate use)

### C. `pg_net` extension lives in `public` (WARN)
Supabase installs `pg_net` in `public` by default and edge functions depend on it. Moving it risks breaking installed objects; we accept this warning.

### D-G. Four SECURITY DEFINER helpers executable by `authenticated` (WARN ×4)
`has_role`, `has_advisory_consent`, `has_active_subscription`, `ai_usage_this_month` are invoked from RLS policies and client RPCs and MUST be executable by signed-in users. EXECUTE has been revoked from `PUBLIC` and `anon`.

---

## Open

None.
