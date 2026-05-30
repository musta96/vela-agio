CREATE POLICY "Advisors view portfolios with consent"
  ON public.portfolios FOR SELECT
  TO authenticated
  USING (public.has_advisory_consent(user_id, auth.uid(), 'portfolio_read'));

CREATE POLICY "Advisors view holdings with consent"
  ON public.portfolio_holdings FOR SELECT
  TO authenticated
  USING (public.has_advisory_consent(user_id, auth.uid(), 'portfolio_read'));

CREATE POLICY "Advisors view nw accounts with consent"
  ON public.net_worth_accounts FOR SELECT
  TO authenticated
  USING (public.has_advisory_consent(user_id, auth.uid(), 'net_worth_read'));