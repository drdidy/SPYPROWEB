import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-static";

const integrations = [
  { name: "Market data sync", detail: "Server-side credentials for quotes and engine inputs", lane: "Market data" },
  { name: "Options flow feed", detail: "Flow, dark pools, GEX, SPY/SPX chains, and Greeks", lane: "Options" },
  { name: "Market data feed", detail: "ES/SPY hourly bars plus VIX/DXY/^TNX", lane: "Market data" },
  { name: "Brief synthesis", detail: "Session narrative generated from market, options, and engine structure", lane: "Brief" },
];

const preferences = [
  {
    label: "Symbol focus",
    value: "SPY + ES",
    note: "Both engines stay visible on the slate; execution tabs can focus by route.",
  },
  {
    label: "Slope source",
    value: "Engine locked",
    note: "SPY and ES projection slopes are read from server constants, not browser controls.",
  },
  {
    label: "Action gates",
    value: "Rules v1.0.0",
    note: "State transitions, confluence thresholds, and guardrails are controlled by the engine.",
  },
  {
    label: "Timezone",
    value: "Market anchored",
    note: "Session windows remain CT-anchored; user-time annotations render on decision surfaces.",
  },
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
            {preferences.map((pref) => (
              <div key={pref.label} className="rounded-card border border-rule bg-paper-2/55 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{pref.label}</div>
                <div className="mt-4 font-serif text-[24px] leading-none text-ink">{pref.value}</div>
                <p className="mt-3 text-[12px] leading-snug text-ink-3">{pref.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-ink-3 leading-relaxed max-w-2xl">
            These are the active production defaults for this build. User-specific
            persistence is disabled until the account store is connected, so the
            browser never presents controls that cannot be saved.
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
