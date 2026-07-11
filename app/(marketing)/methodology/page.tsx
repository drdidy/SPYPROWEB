import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Methodology | SPY Prophet",
  description:
    "How SPY Prophet turns market structure into a calm decision workflow.",
};

export default function MethodologyPage() {
  return (
    <LegalPage
      eyebrow="Methodology"
      title="A calmer way to read the day."
      lastUpdated="2026-05-17"
    >
      <p>
        SPY Prophet is built for traders who want fewer opinions and a cleaner
        routine. The app watches the market through the same disciplined lens
        each day, then tells you whether the read is still waiting, becoming
        interesting, confirmed, or no longer worth chasing.
      </p>

      <h2>Read</h2>
      <p>
        The first job is to understand the session without turning the screen
        into a wall of indicators. Prophet organizes the important references
        and keeps the trader focused on the part of the day that actually
        matters.
      </p>

      <h2>Wait</h2>
      <p>
        A level on a screen is not a trade. The app is intentionally patient.
        It lets price come to the read, then waits for behavior that proves the
        idea deserves attention.
      </p>

      <h2>Decide</h2>
      <p>
        The slate compresses the read into plain language: long, short, wait,
        chase guard, or stand down. It also shows the practical trading pieces:
        entry area, invalidation, target, and why the setup is or is not ready.
      </p>

      <h2>What stays protected</h2>
      <p>
        Prophet does not publish the full recipe behind the engines. Members
        see the actionable read, not the internal model. That keeps the product
        useful, clean, and difficult to copy.
      </p>

      <h2>Who it is for</h2>
      <p>
        This is for active traders who want a sharper morning workflow, not
        more noise. It is decision-support software, not financial advice, and
        every trade still belongs to the person placing it.
      </p>
    </LegalPage>
  );
}
