import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Methodology · SPY Prophet",
  description:
    "How SPY Prophet reads the day. The three-step framework, the six-rule discipline, and why most signals don't clear the bar.",
};

export default function MethodologyPage() {
  return (
    <LegalPage
      eyebrow="Methodology"
      title="How we read the day."
      lastUpdated="2026-05-09"
    >
      <p>
        SPY Prophet is built around one fixed structure for reading
        the trading day. The structure doesn&apos;t change session to
        session — that&apos;s the point. The work of trading is being
        honest about what you saw, repeatedly, in the same way.
      </p>

      <h2>Three steps · same three, every day</h2>

      <h3>1 · Read</h3>
      <p>
        Every morning starts from what the market just printed. Not a
        story. Just two facts: yesterday&apos;s prior-RTH high pivot
        and prior-RTH low pivot. Those two facts set up the rest of
        the day, and we read them the same way every time. No
        interpretation required.
      </p>

      <h3>2 · Project</h3>
      <p>
        From those two facts, lines on the chart. Same lines every
        day — projected forward at a fixed slope. We then ask price
        to respect them. A touch and reject is a setup. A clean push
        through is information for tomorrow. We don&apos;t fit the
        lines to the day; the day either honors them or it
        doesn&apos;t.
      </p>

      <h3>3 · Decide</h3>
      <p>
        Setups go through one bar before they&apos;re trades. The bar
        is high — it pulls several factors (overnight bias, premarket
        flow, qualified rejection on the line, follow-through) into a
        single yes-or-no answer. Most setups don&apos;t clear it. The
        ones that do are rare and easy to read.
      </p>

      <h2>The six rules</h2>
      <p>
        The discipline manifesto on the home page is the operational
        version of the methodology. The short list:
      </p>
      <ul>
        <li>One read every morning, not many.</li>
        <li>Lines, not patterns.</li>
        <li>Touch · reject · close.</li>
        <li>Confirmation before action.</li>
        <li>Stop where the read is wrong, not where it stings.</li>
        <li>One trade beats ten of explanations.</li>
      </ul>

      <h2>What the engine does</h2>
      <p>
        The engine on the dashboard runs the methodology continuously
        during market hours. Each morning at 03:00 CT (SPY) and
        17:00 CT the previous day (ES) it observes the configuration
        window and plots the day&apos;s lines. From RTH open through
        close it watches each price print against the lines, applies
        the discipline gates, and surfaces a single
        decision-support verdict per engine.
      </p>
      <p>
        The numerical thresholds — exact line slopes, rejection
        wick-ratio gates, confluence weights — are not published.
        That&apos;s deliberate. Public thresholds get gamed; the
        framework has more value as a routine than as a recipe.
      </p>

      <h2>Closed-beta cohort intent</h2>
      <p>
        We open the workspace to a few traders at a time so we can
        learn how each cohort reads the slate before opening the next.
        We&apos;re not soliciting testimonials during beta — the
        right moment to ask is after a full quarter of sessions, not
        after a launch week. If you&apos;re in beta, your honest
        feedback is the only review we&apos;re collecting.
      </p>
    </LegalPage>
  );
}
