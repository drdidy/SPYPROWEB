import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Careers · SPY Prophet",
  description: "Working at SPY Prophet — current openings and how we hire.",
};

export default function CareersPage() {
  return (
    <LegalPage eyebrow="Careers" title="Working here." lastUpdated="2026-05-09">
      <p>
        We&apos;re a small team building a serious tool for serious traders.
        We don&apos;t have open roles at the moment. When we do, they&apos;ll
        be listed here.
      </p>

      <h3>What we look for</h3>
      <ul>
        <li>People who trade their own capital and have an opinion about why most retail tools are bad.</li>
        <li>Engineers who care about latency, correctness, and the difference between a chart that animates and a chart that&apos;s right.</li>
        <li>People who think discipline is a feature.</li>
      </ul>

      <h3>Reach out anyway</h3>
      <p>
        If you read the manifesto and felt understood, write
        <a href="mailto:hello@spyprophet.app"> hello@spyprophet.app</a> with
        a short note about why and what you&apos;d build.
      </p>
    </LegalPage>
  );
}
