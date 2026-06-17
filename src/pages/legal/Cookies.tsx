import { LegalLayout } from "@/components/legal/LegalLayout";
import { Button } from "@/components/ui/button";
import { openCookieSettings } from "@/lib/consent";

export default function Cookies() {
  return (
    <LegalLayout title="Cookie Policy" updated="May 2026">
      <p>
        Vela.ai uses cookies and similar technologies (localStorage, sessionStorage) to make the
        service work and, with your consent, to measure how it is used.
      </p>

      <div className="not-prose my-6 p-4 rounded-lg bg-card border border-border">
        <p className="text-sm text-foreground mb-3">Manage your preferences at any time:</p>
        <Button size="sm" onClick={openCookieSettings}>
          Open cookie settings
        </Button>
      </div>

      <h2>1. Strictly necessary (always active)</h2>
      <p>
        Required to authenticate you, keep you signed in, remember your selected portfolio, and
        protect against CSRF/abuse. The service cannot work without these. Under ePrivacy and
        GDPR these do not require consent.
      </p>
      <ul>
        <li><code>sb-access-token</code>, <code>sb-refresh-token</code> - Lovable Cloud auth (session lifetime)</li>
        <li><code>vela_consent</code> - your cookie choices (12 months)</li>
        <li><code>vela_active_portfolio</code> - last selected portfolio (12 months)</li>
      </ul>

      <h2>2. Analytics (consent required)</h2>
      <p>
        Aggregated, anonymized usage data - which pages you visit, which features you use, error
        rates. Helps us prioritize improvements. Disabled by default.
      </p>

      <h2>3. Marketing (consent required)</h2>
      <p>
        Used to measure the effectiveness of campaigns and personalize content. Disabled by
        default. Vela.ai does not currently run third-party ad pixels; this category is reserved
        for future use and will require fresh consent before activation.
      </p>

      <h2>Withdrawing consent</h2>
      <p>
        Click "Open cookie settings" above at any time, or visit{" "}
        <a href="/cookies">vela.ai/cookies</a>. Withdrawal does not affect the lawfulness of
        processing carried out before withdrawal.
      </p>
    </LegalLayout>
  );
}