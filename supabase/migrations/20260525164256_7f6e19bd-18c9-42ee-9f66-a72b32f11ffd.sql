-- Notifications: explicit deny INSERT from clients (server/service-role only)
CREATE POLICY "Deny client insert notifications"
ON public.notifications
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

-- Portfolio simulations: explicit deny UPDATE from clients
CREATE POLICY "Deny client update simulations"
ON public.portfolio_simulations
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- SnapTrade connections: revoke client access; service role only
DROP POLICY IF EXISTS "Users manage own snaptrade binding" ON public.snaptrade_connections;

CREATE POLICY "Deny client access to snaptrade connections"
ON public.snaptrade_connections
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);