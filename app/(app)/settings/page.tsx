import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-static";

const integrations = [
  { name: "Broker feed", detail: "Server-side credentials; options chain and sync quote", lane: "Broker" },
  { name: "Unusual Whales", detail: "REST flow and GEX", lane: "Flow" },
  { name: "Market data feed", detail: "ES/SPY hourly bars plus VIX/DXY/^TNX", lane: "Market data" },
  { name: "OpenAI", detail: "Reserved for daily-brief generation", lane: "Brief" },
];

export default function Page() {
  return (
    <div className="w-full max-w-[1280px] pb-16 space-y-8">
      <PageHeader eyebrow="Journal - 14" title="Configuration" lede="Workspace preferences and integrations." />

      <SectionLabel number="01">Integrations</SectionLabel>
      <Card>
        <CardHeader eyebrow="Data sources" title="Live feed map" />
        <CardBody>
          <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5">
            <div className="rounded-card border border-[#243138] bg-[#071116] text-paper p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">Environment</div>
              <div className="mt-3 font-serif text-[32px] leading-none">Keys stay server-side.</div>
              <p className="mt-4 text-[13px] leading-relaxed text-paper/62">
                This view documents the integration lanes without exposing secrets or implying a connection status the browser cannot verify.
              </p>
            </div>
            <ul className="divide-y divide-rule rounded-card border border-rule overflow-hidden">
              {integrations.map((item, i) => (
                <Row key={item.name} {...item} index={i + 1} />
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      <SectionLabel number="02">Preferences</SectionLabel>
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {["Symbol focus", "Slope override", "Action gates", "Timezone"].map((label) => (
              <div key={label} className="rounded-card border border-rule bg-paper-2/55 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{label}</div>
                <div className="mt-5 font-serif text-[24px] leading-none text-ink-3 italic">Coming soon</div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-ink-3 leading-relaxed max-w-2xl">
            User-specific preferences are intentionally parked until auth and persistence land. Until then, the app uses the production engine configuration.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({
  name,
  detail,
  lane,
  index,
}: {
  name: string;
  detail: string;
  lane: string;
  index: number;
}) {
  return (
    <li className="grid grid-cols-12 gap-4 items-center bg-paper px-4 py-4">
      <span className="col-span-2 md:col-span-1 font-serif text-[28px] leading-none text-gold-ink/35">
        {String(index).padStart(2, "0")}
      </span>
      <span className="col-span-4 md:col-span-3 font-mono text-[12px] font-semibold text-ink">{name}</span>
      <span className="hidden md:block col-span-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{lane}</span>
      <span className="col-span-6 text-ink-3 text-[12px] leading-snug">{detail}</span>
    </li>
  );
}
