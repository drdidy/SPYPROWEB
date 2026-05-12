"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SPXSnapshot } from "@/lib/types";

export function SPXSessionOrigin({ snap }: { snap: SPXSnapshot }) {
  const hasSydney = isMeasured(snap.sessions.sydney.high) && isMeasured(snap.sessions.sydney.low);
  const hasTokyo = isMeasured(snap.sessions.tokyo.high) && isMeasured(snap.sessions.tokyo.low);
  const canCompare = hasSydney && hasTokyo;
  const tokyoHH = canCompare && snap.sessions.tokyo.high > snap.sessions.sydney.high;
  const tokyoHL = canCompare && snap.sessions.tokyo.low > snap.sessions.sydney.low;
  const tokyoLH = canCompare && snap.sessions.tokyo.high < snap.sessions.sydney.high;
  const tokyoLL = canCompare && snap.sessions.tokyo.low < snap.sessions.sydney.low;
  return (
    <Card>
      <CardHeader
        eyebrow="Origin"
        title="Why today's framework"
        meta="Overnight swing closes before 02:00 CT - previous RTH references"
      />
      <CardBody className="px-0 pb-0">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-rule">
          <SessionPanel
            name="Sydney"
            window="17:00-20:00 CT"
            high={snap.sessions.sydney.high}
            low={snap.sessions.sydney.low}
            highTime={snap.sessions.sydney.highTime}
            lowTime={snap.sessions.sydney.lowTime}
          />
          <SessionPanel
            name="Tokyo"
            window="21:00-03:00 CT"
            high={snap.sessions.tokyo.high}
            low={snap.sessions.tokyo.low}
            highTime={snap.sessions.tokyo.highTime}
            lowTime={snap.sessions.tokyo.lowTime}
            badges={
              <>
                {tokyoHH && (
                  <span className="text-[9px] font-mono text-bull-ink uppercase tracking-[0.10em]">
                    HH
                  </span>
                )}
                {tokyoHL && (
                  <span className="text-[9px] font-mono text-bull-ink uppercase tracking-[0.10em]">
                    HL
                  </span>
                )}
                {tokyoLH && (
                  <span className="text-[9px] font-mono text-bear-ink uppercase tracking-[0.10em]">
                    LH
                  </span>
                )}
                {tokyoLL && (
                  <span className="text-[9px] font-mono text-bear-ink uppercase tracking-[0.10em]">
                    LL
                  </span>
                )}
              </>
            }
          />
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="eyebrow text-ink-3">Framework</span>\n              <StatusPill variant={snap.lines.length >= 6 ? "confirmed" : "stale"}>\n                {snap.lines.length >= 6 ? "SIX LINE" : "RESOLVING"}\n              </StatusPill>
            </div>
            <div className="text-[13px] text-ink-2 leading-relaxed">
              {determinationText(snap)}
            </div>
            <div className="mt-4 hr-rule" />
            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
              <Anchor
                label="Overnight High"
                value={snap.overnight.high.price}
                time={snap.overnight.high.time}
              />
              <Anchor
                label="Overnight Low"
                value={snap.overnight.low.price}
                time={snap.overnight.low.time}
              />
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function SessionPanel({
  name,
  window,
  high,
  low,
  highTime,
  lowTime,
  badges,
}: {
  name: string;
  window: string;
  high: number;
  low: number;
  highTime: string;
  lowTime: string;
  badges?: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="font-serif text-title text-ink">{name}</div>
          <div className="font-mono text-[10px] text-ink-3 mt-0.5">{window}</div>
        </div>
        {badges && <div className="flex gap-1.5">{badges}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="High" value={high} time={highTime} tone="bull" />
        <Stat label="Low" value={low} time={lowTime} tone="bear" />
      </div>
      <div className="mt-3 flex justify-between text-[11px]">
        <span className="text-ink-3">Range</span>
        <span className="font-mono tabular-nums text-ink" data-num>
          {isMeasured(high) && isMeasured(low) ? `${(high - low).toFixed(2)} pts` : "-"}
        </span>
      </div>
      {isMeasured(high) && isMeasured(low) ? (
        <div className="mt-3 h-2 rounded-full bg-paper-2">
          <div className="h-full w-full rounded-full bg-ink/18" />
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-snug text-ink-3">
          Data missing or session not started.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  time,
  tone = "ink",
}: {
  label: string;
  value: number;
  time: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : "text-ink";
  const measured = isMeasured(value);
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper-2/60">
      <div className="eyebrow text-ink-3">{label}</div>
      <div
        className={`font-mono text-sm font-semibold tabular-nums ${cls}`}
        data-num
      >
        {measured ? value.toFixed(2) : "-"}
      </div>
      <div className="font-mono text-[9px] text-ink-3 tabular-nums mt-0.5">
        {measured ? formatClock(time) : "Data missing"}
      </div>
    </div>
  );
}

function Anchor({
  label,
  value,
  time,
}: {
  label: string;
  value: number;
  time: string;
}) {
  const measured = isMeasured(value);
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono text-sm font-semibold tabular-nums text-ink"
          data-num
        >
          {measured ? value.toFixed(2) : "-"}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {measured ? formatClock(time) : "Data missing"}
        </span>
      </div>
    </div>
  );
}

function isMeasured(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function formatClock(time: string): string {
  const t = new Date(time);
  if (Number.isNaN(t.getTime())) return "--:-- CT";
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} CT`;
}

function determinationText(snap: SPXSnapshot): string {
  if (snap.lines.length >= 6) {
    return snap.channel.reason;
  }
  return "The ES framework resolves after the required overnight and prior-session references are available.";
}

