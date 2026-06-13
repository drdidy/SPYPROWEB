import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  alertSecrets,
  configuredTelegramChatId,
  maskChatId,
  readStoredTelegramChatId,
  telegramBotToken,
} from "@/lib/telegram-alerts";

export const dynamic = "force-dynamic";

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
  return <ConfigurationPage />;
}

async function ConfigurationPage() {
  const storedTelegramChat = await readStoredTelegramChatId();
  const envTelegramChat = configuredTelegramChatId();
  const botReady = !!telegramBotToken();
  const secretReady = alertSecrets().length > 0;
  const baseUrl = "https://www.spyprophet.app";

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

      <SectionLabel number="02">Alerts</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="TradingView + Telegram"
          title="EMA/Fib alert pipeline"
          meta="Cross, armed, entry, target, invalidation"
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <AlertStatusTile
              label="Webhook"
              value="Live"
              ok
              note={`${baseUrl}/api/tradingview/ema-fib`}
            />
            <AlertStatusTile
              label="Secret"
              value={secretReady ? "Installed" : "Missing"}
              ok={secretReady}
              note="TradingView must include ?token=..."
            />
            <AlertStatusTile
              label="Telegram bot"
              value={botReady ? "Installed" : "Missing"}
              ok={botReady}
              note="Production bot token stays server-side."
            />
            <AlertStatusTile
              label="Telegram chat"
              value={storedTelegramChat ? "Bound" : "Needs /start"}
              ok={!!storedTelegramChat}
              note={
                storedTelegramChat
                  ? `Stored chat ${maskChatId(storedTelegramChat)}`
                  : envTelegramChat
                    ? "Env chat exists but is not verified. Send /start to bind."
                    : "Send /start to the bot once."
              }
            />
          </div>

          <div className="mt-5 rounded-card border border-rule bg-paper-2/55 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink/80">
              Operator setup
            </div>
            <ol className="mt-3 grid gap-2 text-[13px] leading-relaxed text-ink-2 md:grid-cols-3">
              <li>
                <span className="font-semibold text-ink">1.</span> Add the Pine script from
                <span className="font-mono text-ink"> docs/tradingview </span>
                to TradingView.
              </li>
              <li>
                <span className="font-semibold text-ink">2.</span> Alert condition:
                <span className="font-mono text-ink"> Any alert() function call</span>.
              </li>
              <li>
                <span className="font-semibold text-ink">3.</span> Send
                <span className="font-mono text-ink"> /start </span>
                to the SPY Prophet Telegram bot once.
              </li>
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              Webhook URL:{" "}
              <span className="font-mono text-ink">
                {baseUrl}/api/tradingview/ema-fib?token=YOUR_SECRET
              </span>
              . The secret is intentionally not printed in the browser.
            </p>
          </div>
        </CardBody>
      </Card>

      <SectionLabel number="03">Preferences</SectionLabel>
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

function AlertStatusTile({
  label,
  value,
  note,
  ok,
}: {
  label: string;
  value: string;
  note: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-card border border-rule bg-paper-2/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          {label}
        </div>
        <span
          className={`h-2 w-2 rounded-full ${ok ? "bg-bull" : "bg-gold"}`}
          aria-label={ok ? `${label} ready` : `${label} needs attention`}
        />
      </div>
      <div className="mt-4 font-serif text-[24px] leading-none text-ink">{value}</div>
      <p className="mt-3 text-[12px] leading-snug text-ink-3">{note}</p>
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
