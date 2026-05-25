import { LegalLayout } from "@/components/legal/LegalLayout";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="May 2026">
      <p>
        By creating a Vela.ai account or using the service, you agree to these Terms. Read them
        carefully — they include important disclaimers about investment information and limits on
        our liability.
      </p>

      <h2>1. What Vela.ai is — and is not</h2>
      <p>
        Vela.ai is an <strong>information and analysis tool</strong> for self-directed investors.
        It aggregates public market data, runs analytical models, and provides AI-generated
        commentary.
      </p>
      <p>Vela.ai is <strong>NOT</strong>:</p>
      <ul>
        <li>A broker, dealer, or investment firm. We are not authorized by CONSOB, the SEC, FCA,
          or any other financial regulator.</li>
        <li>An investment advisor under MiFID II, the US Investment Advisers Act, or any
          equivalent regime. We do not provide personalized recommendations.</li>
        <li>A custodian of your funds. We never hold money or securities.</li>
        <li>A tax advisor. Tax-loss harvesting suggestions are informational only.</li>
      </ul>

      <h2>2. Eligibility</h2>
      <p>You must be at least 18 years old and legally able to enter contracts in your country.</p>

      <h2>3. Your account</h2>
      <p>
        You are responsible for safeguarding your credentials. Notify us immediately at{" "}
        <a href="mailto:security@vela.ai">security@vela.ai</a> if you suspect unauthorized access.
      </p>

      <h2>4. Bring-your-own (BYO) keys and integrations</h2>
      <ul>
        <li>
          When you add a third-party API key (OpenAI, Finnhub, etc.) or connect a broker
          (SnapTrade, IBKR, Alpaca), you authorize Vela.ai to use those credentials on your behalf
          for the features you enable.
        </li>
        <li>
          <strong>You are responsible for complying with that provider's Terms of Service.</strong>
          You confirm your usage does not violate any redistribution clauses (e.g. Bloomberg
          Terminal, Refinitiv, and FactSet feeds are explicitly forbidden from server-side
          third-party use and are not supported by Vela.ai).
        </li>
        <li>Costs charged by those providers are your responsibility.</li>
      </ul>

      <h2>5. Order placement</h2>
      <p>
        If you connect a brokerage that supports order routing (e.g. Interactive Brokers, Alpaca),
        each order requires explicit confirmation in the UI. <strong>Vela.ai never auto-places
        orders.</strong> The order is placed by your broker, under your account, using your
        authorization. We do not custody, net, or batch orders. Execution quality, settlement,
        and compliance are governed by your broker's agreement with you.
      </p>

      <h2>6. AI-generated content</h2>
      <p>
        Some outputs are produced by large language models. They may be inaccurate, incomplete,
        or out of date. We label AI-generated content with a visible badge. Do not rely on AI
        outputs as the sole basis for any investment decision.
      </p>

      <h2>7. Acceptable use</h2>
      <ul>
        <li>No scraping or reverse engineering of the service.</li>
        <li>No use to facilitate market manipulation, insider trading, or other unlawful conduct.</li>
        <li>No use of unofficial/reverse-engineered broker APIs through our platform.</li>
      </ul>

      <h2>8. Subscription &amp; fees</h2>
      <p>
        Free and paid tiers may be offered. Paid plans renew automatically unless cancelled. EU
        consumers have a 14-day right of withdrawal under Directive 2011/83/EU; this right does
        not apply once digital content has been delivered with your explicit consent.
      </p>

      <h2>9. Disclaimers and limitation of liability</h2>
      <p>
        The service is provided "AS IS" without warranties of any kind. To the maximum extent
        permitted by law, Vela.ai is not liable for trading losses, missed opportunities, data
        errors, third-party provider outages, or indirect/consequential damages. Our total
        aggregate liability is limited to fees you paid in the 12 months preceding the claim, or
        EUR 100, whichever is higher. Nothing in these Terms excludes liability that cannot be
        excluded under mandatory consumer law.
      </p>

      <h2>10. Termination</h2>
      <p>You may delete your account at any time from Settings. We may suspend accounts that
        violate these Terms after reasonable notice unless legally required to act sooner.</p>

      <h2>11. Governing law &amp; jurisdiction</h2>
      <p>
        These Terms are governed by Italian law. Disputes are subject to the exclusive
        jurisdiction of the courts of Milan, Italy, except where mandatory consumer law gives
        consumers the right to bring proceedings in their country of residence. EU consumers may
        also use the European Commission's Online Dispute Resolution platform at{" "}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
          ec.europa.eu/consumers/odr
        </a>.
      </p>

      <h2>12. Contact</h2>
      <p>Questions: <a href="mailto:hello@vela.ai">hello@vela.ai</a>.</p>
    </LegalLayout>
  );
}