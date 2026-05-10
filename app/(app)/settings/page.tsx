import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-static";

export default function Page() {
  return (
    <div className="w-full max-w-[1120px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Journal · 14"
        title="Configuration"
        lede="Workspace preferences and integrations."
      />
      <SectionLabel number="01">Integrations</SectionLabel>
      <Card>
        <CardHeader eyebrow="Data sources" title="Live feeds" />
        <CardBody>
          <ul className="divide-y divide-rule text-[13px]">
            <Row name="Tastytrade" detail="OAuth refresh token; options chain + sync quote" />
            <Row name="Unusual Whales" detail="REST flow + GEX" />
            <Row name="Yahoo Finance" detail="ES/SPY hourly bars + VIX/DXY/^TNX" />
            <Row name="OpenAI" detail="Reserved for daily-brief generation" />
          </ul>
        </CardBody>
      </Card>

      <SectionLabel number="02">Preferences</SectionLabel>
      <Card>
        <CardBody>
          <div className="font-serif text-headline text-ink-3 italic font-light">
            User preferences coming soon.
          </div>
          <p className="mt-3 text-[13px] text-ink-3 leading-relaxed max-w-md">
            Symbol focus, slope override, action-gate thresholds, theme,
            timezone display. Wiring landing once the auth + persistence
            layer is in place.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ name, detail }: { name: string; detail: string }) {
  return (
    <li className="flex items-baseline justify-between py-3">
      <span className="font-mono text-ink">{name}</span>
      <span className="text-ink-3 text-[12px]">{detail}</span>
    </li>
  );
}
