import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Disclosures · SPY Prophet",
  description:
    "What SPY Prophet is and isn't, regulatory status, and what you should know before using the Service.",
};

// TODO(legal): the "not investment advice" framing is the foundational
// posture. Counsel should confirm the FINRA / NFA / SEC posture for
// the educational-tool exemption, and add any state-specific BD
// disclosures if a paid tier ever sells subscriptions in IL/CA/NY.

export default function DisclosuresPage() {
  return (
    <LegalPage
      eyebrow="Disclosures"
      title="What this is, and isn't."
      lastUpdated="2026-05-09"
    >
      <h2>Not investment advice</h2>
      <p>
        SPY Prophet is an educational decision-support workspace. Nothing
        produced by the Service — including any verdict, conviction score,
        signal, line, envelope, recap, or commentary — constitutes
        investment advice, a recommendation to buy or sell any security or
        derivative, a solicitation, or a representation that any
        transaction is suitable for any specific person. You alone are
        responsible for your trading decisions and their outcomes.
      </p>

      <h2>Regulatory status</h2>
      <p>
        SPY Prophet is not registered as a broker-dealer, investment
        adviser, futures commission merchant, commodity pool operator, or
        commodity trading advisor with the SEC, FINRA, NFA, CFTC, or any
        other regulatory body. We do not place orders, hold customer
        funds, or solicit transactions.
      </p>

      <h2>No performance guarantees</h2>
      <p>
        Any performance figures shown — whether historical, hypothetical,
        or live — are provided for educational context only. Hypothetical
        performance has inherent limitations: it is prepared with the
        benefit of hindsight, does not reflect actual trading, does not
        account for slippage, market impact, or commissions, and may not
        reflect the discipline required to follow the strategy in real
        time. Past performance does not guarantee future results.
      </p>

      <h2>Conflicts of interest</h2>
      <p>
        Members of the SPY Prophet team trade their own capital in some
        of the same instruments the Service analyzes (primarily SPY and
        SPX options). The Service&apos;s output is not adjusted based on
        the team&apos;s positions. Where a material conflict could arise
        from a feature change or piece of commentary, we will disclose it.
      </p>

      <h2>Data sources</h2>
      <p>
        Quotes shown on the Service may be delayed, sourced from third
        parties or broker/data-provider feeds, and may differ from your
        broker&apos;s feed.
        Always confirm critical figures against your own broker before
        acting.
      </p>

      <h2>Affiliate links and partners</h2>
      <p>
        We do not currently maintain affiliate or revenue-share
        relationships with brokers, exchanges, or data vendors. If that
        changes, the relationship will be disclosed inline at the point
        of mention.
      </p>

      <h2>Methodology</h2>
      <p>
        Our reasoning framework — the &quot;read · project · decide&quot;
        triad and the six-rule discipline — is described on the{" "}
        <a href="/methodology">Methodology</a> page. The framework is
        proprietary; numerical thresholds are not disclosed publicly to
        prevent gaming.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Disclosures:{" "}
        <a href="mailto:legal@spyprophet.app">legal@spyprophet.app</a>.
      </p>
    </LegalPage>
  );
}
