import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "About · SPY Prophet",
  description:
    "SPY Prophet is a decision workspace for serious retail traders, built around one fixed structure for reading the day.",
};

export default function AboutPage() {
  return (
    <LegalPage eyebrow="About" title="A workspace, not a feed." lastUpdated="2026-05-09">
      <p>
        SPY Prophet is a decision workspace for serious retail traders. The
        structure stays the same: one read every morning, one set of lines on
        the chart, one bar that setups have to clear. What you do with it is
        on you.
      </p>

      <h2>Why we built this</h2>
      <p>
        Most retail trading tools assume you want more — more signals, more
        indicators, more dashboards. We think the opposite is true. The work
        of trading is being honest about what you saw, repeatedly, in the
        same way. Prophet is the surface that holds you to that.
      </p>

      <h2>Team</h2>
      <p>
        Built in Chicago by a small team with backgrounds in
        equities/options, futures, and product engineering. We trade what we
        ship.
      </p>
    </LegalPage>
  );
}
