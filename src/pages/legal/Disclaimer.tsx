import { LegalLayout } from "@/components/legal/LegalLayout";

export default function Disclaimer() {
  return (
    <LegalLayout title="Investment Disclaimer" updated="May 2026">
      <p>
        <strong>Vela.ai is an information tool, not a financial advisor.</strong> Nothing on this
        platform constitutes investment advice, a recommendation, a solicitation, or an offer to
        buy or sell any security, derivative, currency, or other financial instrument.
      </p>

      <h2>No advice — informazioni, non consulenza</h2>
      <p>
        All analyses, scores, screeners, AI commentary, backtest results, intrinsic-value
        estimates, sentiment scores, and "smart picks" are <strong>educational and informational
        in nature only</strong>. They are not personalized to your financial situation, goals,
        risk tolerance, or tax position.
      </p>
      <p>
        Vela.ai is not authorized by CONSOB (Italy), the SEC (United States), the FCA (United
        Kingdom), BaFin (Germany), or any other competent authority to provide investment
        services as defined under MiFID II (Directive 2014/65/EU), the US Investment Advisers Act
        of 1940, or equivalent regimes.
      </p>

      <h2>Risk warning</h2>
      <p>
        Investing in financial markets involves substantial risk, including the risk of losing
        more than your initial capital when using leveraged or derivative instruments. Past
        performance is not indicative of future results. Backtests are hypothetical, are
        constructed with the benefit of hindsight, and do not represent results that any actual
        investor achieved.
      </p>

      <h2>AI-generated outputs</h2>
      <p>
        Where you see the "AI" badge, the content was produced by a large language model. These
        models can be wrong. They may hallucinate, omit material information, or use stale data.
        Verify every fact before acting on it.
      </p>

      <h2>Third-party data</h2>
      <p>
        Market data is provided by third parties (Yahoo Finance and, when you connect them, your
        own data providers). Data can be delayed, incomplete, or inaccurate. Vela.ai is not
        responsible for third-party data errors.
      </p>

      <h2>Do your own research</h2>
      <p>
        Before making any investment decision, consult a qualified, licensed financial advisor in
        your jurisdiction and read the official documentation of the instrument (KIID, prospectus,
        10-K, etc.). You are solely responsible for your investment decisions and their
        consequences.
      </p>

      <h2>Italian users</h2>
      <p>
        Ai sensi della normativa italiana (Testo Unico della Finanza, D.lgs. 58/1998) e della
        Direttiva MiFID II, Vela.ai non presta servizi di investimento, non fornisce raccomandazioni
        personalizzate e non gestisce patrimoni. I contenuti hanno finalità esclusivamente
        informative ed educative. Si raccomanda di rivolgersi a un consulente finanziario abilitato
        prima di assumere qualsiasi decisione di investimento.
      </p>
    </LegalLayout>
  );
}