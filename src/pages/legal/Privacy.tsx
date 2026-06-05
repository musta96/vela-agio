import { LegalLayout } from "@/components/legal/LegalLayout";
import { useEffect, useState } from "react";
import { LEGAL_ENTITY_DISPLAY, PII_REDACTED_DEFAULT, getPublicLegalEntity } from "@/lib/legal-entity";
import { supabase } from "@/integrations/supabase/client";

export default function Privacy() {
  const [redacted, setRedacted] = useState<boolean>(PII_REDACTED_DEFAULT);
  useEffect(() => {
    supabase
      .from("platform_controls")
      .select("enabled")
      .eq("key", "public_pii_redacted")
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.enabled === "boolean") setRedacted(data.enabled);
      });
  }, []);
  const entity = getPublicLegalEntity(redacted);
  return (
    <LegalLayout title="Privacy Policy" updated="May 2026">
      <p>
        Vela.ai ("we", "us") is a market-information and portfolio-analysis tool. This Privacy
        Policy explains what personal data we process, why, and your rights under the EU General
        Data Protection Regulation (GDPR), the Italian Codice Privacy (D.lgs. 196/2003 as amended
        by D.lgs. 101/2018), the UK Data Protection Act 2018, and the California Consumer Privacy
        Act (CCPA/CPRA) where applicable.
      </p>

      <h2>1. Data Controller</h2>
      <p>
        The data controller (titolare del trattamento) is{" "}
        <strong>{LEGAL_ENTITY_DISPLAY}</strong>
        {entity.form ? <> — {entity.form}</> : null}
        {entity.registeredAddress ? <>, with registered address at {entity.registeredAddress}</> : null}
        {entity.vatNumber ? <> (P. IVA {entity.vatNumber}</> : null}
        {entity.taxCode ? <>, Codice Fiscale {entity.taxCode})</> : entity.vatNumber ? <>)</> : null}.
      </p>
      <p>
        Contact for privacy enquiries and to exercise your GDPR rights:{" "}
        <a href={`mailto:${entity.contactEmail}`}>{entity.contactEmail}</a>
        {entity.pec && entity.pec !== entity.contactEmail ? (
          <>
            {" "}· PEC (official certified channel, EU residents):{" "}
            <a href={`mailto:${entity.pec}`}>{entity.pec}</a>
          </>
        ) : null}.
      </p>
      <p className="text-xs text-muted-foreground">
        <strong>Notice:</strong> Vela.ai is currently operated by a natural person under
        Italian P.IVA. {redacted ? "Only the legally-required identifiers are published; additional details (Codice Fiscale, alternate contact channels) are available on written request via PEC." : null} Once a limited-liability company (S.R.L.) is incorporated, the
        controller will be updated and prior consents will be re-confirmed.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — email address, display name, hashed password (or
          OAuth identifier if you sign in with Google).
        </li>
        <li>
          <strong>Portfolio &amp; watchlist data</strong> — symbols, share counts, average
          prices, notes you enter. Stored encrypted at rest.
        </li>
        <li>
          <strong>Bring-your-own API keys</strong> — keys you save for third-party providers
          (OpenAI, Finnhub, etc.) are encrypted with AES-256-GCM using a server-side master key
          you never see. Decrypted only inside our serverless functions, per request, to call
          the provider you chose.
        </li>
        <li>
          <strong>Usage telemetry</strong> — pages visited, features used, errors. Only if you
          accept the "Analytics" cookie category.
        </li>
        <li>
          <strong>Technical data</strong> — IP address, browser, device. Used for security and
          rate-limiting; logs auto-delete after 30 days.
        </li>
      </ul>

      <h2>3. What we do NOT collect</h2>
      <ul>
        <li>We do not collect government IDs. Vela.ai does not custody funds and does not
          require KYC.</li>
        <li>We do not collect broker passwords. Broker connections (when you add them) go
          through OAuth aggregators (SnapTrade, IBKR, Alpaca) — they hold the credentials, not us.</li>
        <li>We do not sell personal data to third parties.</li>
      </ul>

      <h2>4. Legal bases (GDPR Art. 6)</h2>
      <ul>
        <li><strong>Contract</strong> — to provide the service you signed up for.</li>
        <li><strong>Consent</strong> — analytics cookies, marketing emails (withdrawable any time).</li>
        <li><strong>Legitimate interest</strong> — security, fraud prevention, service improvement.</li>
        <li><strong>Legal obligation</strong> — tax records, regulator requests.</li>
      </ul>

      <h2>5. Sub-processors</h2>
      <p>We share data only with vetted providers under DPA:</p>
      <ul>
        <li>Lovable Cloud / Supabase (EU region) — database, auth, edge functions</li>
        <li>Lovable AI Gateway — fallback AI inference when you don't supply your own key</li>
        <li>Resend / Mailgun — transactional email (if enabled)</li>
        <li>Cloudflare — CDN and DDoS protection</li>
      </ul>

      <h2>6. International transfers</h2>
      <p>
        Data is primarily processed in the EU (Frankfurt). Any transfers outside the EEA are
        covered by Standard Contractual Clauses (SCC 2021/914) and additional safeguards.
      </p>

      <h2>7. Retention</h2>
      <ul>
        <li>Account data — until you delete your account, then 30-day grace then purge.</li>
        <li>Portfolio/watchlist — same as account.</li>
        <li>Audit logs — 12 months for security purposes.</li>
        <li>Anonymized usage analytics — up to 24 months.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>Under GDPR / Italian law you have the right to:</p>
      <ul>
        <li>Access, rectify, or erase your data (Art. 15–17)</li>
        <li>Restrict or object to processing (Art. 18, 21)</li>
        <li>Data portability (Art. 20)</li>
        <li>Withdraw consent at any time</li>
        <li>Lodge a complaint with the Italian Garante per la protezione dei dati personali
          (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">garanteprivacy.it</a>)
          or your local DPA</li>
      </ul>
      <p>
        California residents have equivalent rights under CCPA/CPRA including the right to know,
        delete, correct, and opt-out of sale/sharing. We do not sell or share personal data.
      </p>

      <h2>9. Children</h2>
      <p>Vela.ai is not intended for users under 18. We do not knowingly collect data from minors.</p>

      <h2>10. Security</h2>
      <p>
        TLS in transit, AES-256 at rest, row-level security on all user data, encrypted BYO API
        keys, audit logging on admin actions. No system is 100% secure; report vulnerabilities to{" "}
        <a href="mailto:security@vela.ai">security@vela.ai</a>.
      </p>

      <h2>11. Changes</h2>
      <p>
        We will notify you of material changes by email and in-app banner at least 30 days before
        they take effect.
      </p>
    </LegalLayout>
  );
}