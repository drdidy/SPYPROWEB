import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { directionLabel, readEmaFibAlerts } from "@/lib/ema-fib-alerts";
import type { Grade } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID: readonly string[] = ["A+", "A", "B", "C", "D"];

export default async function Page() {
  const [{ data: snap, source }, emaFibAlerts] = await Promise.all([
    loadLiveSnapshot(),
    readEmaFibAlerts(25),
  ]);
  const ticks = snap.signalTicks;

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Journal - 12"
        title="Signal Log"
        lede="Every event the engine printed today, with Replay as the session archive."
        source={source}
      />

      <SectionLabel number="01">Today</SectionLabel>
      <Card>
        <CardHeader eyebrow="Live tape" title={`${ticks.length} event${ticks.length === 1 ? "" : "s"}`} meta="Today's session" />
        <CardBody>
          {ticks.length === 0 ? (
            <CommandEmptyState
              eyebrow="Signal tape"
              title="No signals printed today."
              body="The live log stays blank until the engine resolves a rejection, confirmation, or note. This is a real empty session state, not a hidden archive."
              rows={[
                { label: "Events", value: "0" },
                { label: "Session", value: "Today" },
                { label: "Archive", value: "Open Replay" },
              ]}
            />
          ) : (
            <ol className="relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-rule">
              {ticks.map((t, i) => (
                <li key={i} className="relative pb-4 last:pb-0">
                  <span
                    className={`absolute -left-[18px] top-3 h-3 w-3 rounded-full ring-4 ring-paper ${
                      t.type === "CALL" ? "bg-bull" : t.type === "PUT" ? "bg-bear" : "bg-gold"
                    }`}
                  />
                  <div className="grid grid-cols-12 gap-3 rounded-card border border-rule bg-paper-2/45 px-4 py-3 items-center">
                    <span className="col-span-2 md:col-span-1 font-mono text-[11px] text-ink-3 tabular-nums">{t.time}</span>
                    <span
                      className={`col-span-2 md:col-span-1 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] ${
                        t.type === "CALL" ? "text-bull-ink" : t.type === "PUT" ? "text-bear-ink" : "text-ink-3"
                      }`}
                    >
                      {t.type}
                    </span>
                    <span className="col-span-3 md:col-span-2 font-mono text-[11px] text-ink-2 truncate">{t.line ?? "-"}</span>
                    <span className="col-span-5 md:col-span-7 text-[13px] text-ink-2 leading-snug">{t.body}</span>
                    <span className="hidden md:flex col-span-1 justify-end">
                      {t.grade && VALID.includes(t.grade) && <GradeBadge grade={t.grade as Grade} size="sm" />}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="02">TradingView</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="EMA / Fib continuation"
          title={`${emaFibAlerts.length} webhook event${emaFibAlerts.length === 1 ? "" : "s"}`}
          meta="21/50 cross monitor"
        />
        <CardBody>
          {emaFibAlerts.length === 0 ? (
            <CommandEmptyState
              eyebrow="TradingView alerts"
              title="No EMA/Fib webhook events yet."
              body="When TradingView sends a 21/50 EMA cross, Fib 50 rejection, entry, target, or invalidation alert, it will appear here with validation and notification status."
              rows={[
                { label: "Source", value: "TradingView" },
                { label: "Validation", value: "Strict" },
                { label: "Telegram", value: "Configured by env" },
              ]}
            />
          ) : (
            <ol className="space-y-3">
              {emaFibAlerts.map((alert) => {
                const p = alert.payload;
                const accepted = alert.status === "accepted";
                return (
                  <li
                    key={alert.id}
                    className="grid gap-3 rounded-card border border-rule bg-paper-2/45 px-4 py-3 md:grid-cols-[96px_1fr_160px]"
                  >
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                        {p.symbol}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-ink-2 tabular-nums">
                        {new Date(p.eventAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: "America/Chicago",
                        })}{" "}
                        CT
                      </div>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-pill px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            accepted ? "bg-bull/10 text-bull-ink" : "bg-bear/10 text-bear-ink"
                          }`}
                        >
                          {alert.status}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                          {p.kind.replace(/_/g, " ")}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
                          {directionLabel(p.direction)}
                        </span>
                      </div>
                      <div className="mt-2 text-[13px] leading-relaxed text-ink-2">
                        Fib 50{" "}
                        <span className="font-mono tabular-nums text-ink">
                          {p.fib50.toFixed(2)}
                        </span>
                        {" "}· Last{" "}
                        <span className="font-mono tabular-nums text-ink">
                          {p.last.toFixed(2)}
                        </span>
                        {" "}· 1.5 exit{" "}
                        <span className="font-mono tabular-nums text-ink">
                          {p.extension150.toFixed(2)}
                        </span>
                      </div>
                      {alert.reasons.length > 0 && (
                        <div className="mt-2 text-[12px] leading-relaxed text-bear-ink">
                          {alert.reasons.join(" ")}
                        </div>
                      )}
                    </div>
                    <div className="md:text-right">
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                        Notification
                      </div>
                      <div className="mt-1 text-[12px] text-ink-2">
                        {alert.notification.delivered
                          ? "Delivered"
                          : alert.notification.attempted
                            ? "Attempted"
                            : "Not sent"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="03">Archive</SectionLabel>
      <Card>
        <CardBody>
          <div className="rounded-card bg-[#071116] text-paper border border-[#243138] p-7">
            <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">Historical sessions</div>
            <div className="mt-3 font-serif text-[32px] leading-none text-paper">Replay is the audit trail.</div>
            <p className="mt-4 text-[13px] text-paper/62 leading-relaxed max-w-2xl">
              Use Replay to review prior sessions bar by bar: verdict trail, line touches,
              engine state, anchors, and the exact decision path the engine printed.
            </p>
            <a
              href="/replay"
              className="mt-6 inline-flex min-h-11 items-center rounded-pill border border-gold/35 bg-paper/8 px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-gold-soft transition-colors hover:bg-paper/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              Open Replay
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
