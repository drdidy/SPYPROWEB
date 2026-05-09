import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Risk Disclosure · SPY Prophet",
  description:
    "Trading futures, equities, and options involves substantial risk of loss. Read this before using the Service.",
};

// TODO(legal): the options-specific risk paragraph below mirrors the
// OCC's "Characteristics and Risks of Standardized Options" framing.
// If we ever direct users to specific contracts or sizes, counsel must
// review for FINRA Rule 2210 communications-with-the-public posture.

export default function RiskPage() {
  return (
    <LegalPage
      eyebrow="Risk"
      title="Risk Disclosure"
      lastUpdated="2026-05-09"
    >
      <p>
        Trading equities, futures, and options carries a substantial risk
        of loss and is not suitable for every investor. You should read
        this disclosure carefully and seek independent financial advice
        before using the Service.
      </p>

      <h2>General trading risk</h2>
      <p>
        The price of any traded instrument can move sharply against your
        position. You may lose some or all of the capital you commit, and
        in margined or leveraged products you may lose more than you
        deposited. There is no &quot;safe&quot; instrument, and no
        strategy that eliminates the risk of loss.
      </p>

      <h2>Options risk</h2>
      <p>
        Options are complex products. Buying options can result in the
        complete loss of the premium paid. Selling (writing) options can
        result in losses substantially greater than the premium received,
        potentially unlimited in the case of uncovered short calls.
        Before trading options, you should review the Options Clearing
        Corporation&apos;s &quot;Characteristics and Risks of Standardized
        Options&quot; (the &quot;ODD&quot;), which is available from your
        broker.
      </p>

      <h2>Day trading and short-term trading</h2>
      <p>
        Frequent intraday trading typically generates significant
        commissions, fees, and tax consequences. Day trading is high-risk
        and is not appropriate for most investors. SEC Rule 4210 applies
        a $25,000 minimum equity requirement for pattern day traders in
        margin accounts.
      </p>

      <h2>0DTE and short-dated options</h2>
      <p>
        Zero- and one-day-to-expiration (0DTE / 1DTE) options behave
        nonlinearly and can move from in-the-money to worthless within
        minutes. They are not appropriate for casual or position traders.
        Slippage and bid/ask widening near expiration can be severe.
      </p>

      <h2>Tool reliance</h2>
      <p>
        SPY Prophet&apos;s output is computed from third-party market data
        that may be delayed, incorrect, or unavailable. The Service may
        be down for maintenance or affected by upstream outages. Do not
        place trades that depend on the Service being live.
      </p>

      <h2>Hypothetical and back-tested results</h2>
      <p>
        Hypothetical or back-tested performance is shown for educational
        purposes. Hypothetical results do not represent actual trading,
        cannot reflect the effects of all market factors, and may
        materially overstate or understate the strategy&apos;s real-world
        performance. Past performance does not guarantee future results.
      </p>

      <h2>Personal responsibility</h2>
      <p>
        Every order you place and every position you carry is on you. SPY
        Prophet does not place orders on your behalf, does not receive
        order flow, and does not have authority over any of your
        accounts.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this Risk Disclosure:{" "}
        <a href="mailto:legal@spyprophet.app">legal@spyprophet.app</a>.
      </p>
    </LegalPage>
  );
}
