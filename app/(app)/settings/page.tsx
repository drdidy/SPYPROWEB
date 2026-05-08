import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="14"
      eyebrow="Journal"
      title="Configuration"
      lede="Calibration, data sources, alerts, and personal preferences. The engine ships with sane defaults; this is where you make it your own."
      bullets={[
        "Slope calibration ($/hr), retest tolerance, chase budget — visualized impact on past 30 days.",
        "Data sources: anchor source, options OI vendor, premium-flow provider.",
        "Alert routing: SMS, email, webhook, push — per signal grade and per line family.",
        "Workspace defaults: default timeframe, sidebar pin, theme density.",
      ]}
    />
  );
}
