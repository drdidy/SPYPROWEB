"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Countdown } from "@/components/decision-slate/Countdown";
import { cn } from "@/lib/utils";

interface Props {
  sessionDate: string;
  planOpenISO: string;
  planReadyISO: string;
  referenceISO: string;
  entryISO: string;
  rthCloseISO: string;
  nowISO?: string;
  className?: string;
  compact?: boolean;
}

const CT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function ESPlanCountdownCard({
  sessionDate,
  planOpenISO,
  planReadyISO,
  referenceISO,
  entryISO,
  rthCloseISO,
  nowISO,
  className,
  compact = false,
}: Props) {
  const initialNow = Number.isFinite(Date.parse(nowISO ?? ""))
    ? Date.parse(nowISO!)
    : Date.parse(referenceISO);
  const [now, setNow] = useState(() => initialNow);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const phase = resolvePlanPhase({
    now,
    planOpenISO,
    planReadyISO,
    referenceISO,
    entryISO,
    rthCloseISO,
  });

  return (
    <section
      aria-label="Next ES plan availability"
      className={cn(
        "contrast-dark relative overflow-hidden rounded-[18px] border border-[#C9A227]/35 bg-[#071116] text-paper shadow-[0_20px_58px_-42px_rgba(7,17,22,0.95)]",
        compact ? "px-4 py-3" : "px-4 py-4 md:px-5",
        className,
      )}
    >
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
            Next ES plan available
          </div>
          <div className="mt-1 font-serif text-[25px] leading-none text-paper md:text-[30px]">
            {phase.title}
          </div>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-paper/66">
            {phase.body}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
          <PlanChip
            label={phase.countdownLabel}
            value={
              phase.countdownISO ? (
                <Countdown
                  to={phase.countdownISO}
                  verb={phase.countdownVerb}
                  imminentLabel={phase.imminentLabel}
                />
              ) : (
                "Ready now"
              )
            }
            active
          />
          <PlanChip label="Session" value={formatSessionDate(sessionDate)} />
          <PlanChip label="Builds" value={`${ctTime(planOpenISO)}-${ctTime(planReadyISO)} CT`} />
          <PlanChip label="Primary" value={`${ctTime(referenceISO)} / ${ctTime(entryISO)} CT`} />
        </div>
      </div>
    </section>
  );
}

function PlanChip({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string | ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border px-3 py-2",
        active
          ? "border-gold/45 bg-gold/12"
          : "border-white/10 bg-white/[0.055]",
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/46">
        {label}
      </div>
      <div className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-paper">
        {value}
      </div>
    </div>
  );
}

function resolvePlanPhase({
  now,
  planOpenISO,
  planReadyISO,
  referenceISO,
  entryISO,
  rthCloseISO,
}: {
  now: number;
  planOpenISO: string;
  planReadyISO: string;
  referenceISO: string;
  entryISO: string;
  rthCloseISO: string;
}) {
  const open = Date.parse(planOpenISO);
  const ready = Date.parse(planReadyISO);
  const reference = Date.parse(referenceISO);
  const entry = Date.parse(entryISO);
  const close = Date.parse(rthCloseISO);

  if (now < open) {
    return {
      title: "Futures window opens at 17:00 CT",
      body:
        "The next ES plan starts building when the futures session opens the prior evening, then becomes plan-ready at 02:00 CT.",
      countdownLabel: "Opens",
      countdownISO: planOpenISO,
      countdownVerb: "in",
      imminentLabel: "Opening now",
    };
  }
  if (now < ready) {
    return {
      title: "ES plan is building",
      body:
        "The overnight window is collecting the data for tomorrow's 08:00 ladder. Use the plan-ready read after 02:00 CT.",
      countdownLabel: "Ready",
      countdownISO: planReadyISO,
      countdownVerb: "in",
      imminentLabel: "Plan ready",
    };
  }
  if (now < reference) {
    return {
      title: "ES plan ready for pre-open",
      body:
        "The overnight ES framework is available now. The 08:00 reference is the first morning planning checkpoint.",
      countdownLabel: "08:00 ref",
      countdownISO: referenceISO,
      countdownVerb: "in",
      imminentLabel: "08:00 ref live",
    };
  }
  if (now < entry) {
    return {
      title: "08:00 ES reference is live",
      body:
        "Use the 08:00 ladder to frame the day. The 09:00 candle is the main institutional entry read.",
      countdownLabel: "09:00 read",
      countdownISO: entryISO,
      countdownVerb: "in",
      imminentLabel: "09:00 read live",
    };
  }
  if (now < close) {
    return {
      title: "ES plan active now",
      body:
        "The plan is live. Keep 09:00-12:00 CT as the best-quality entry window, then treat 12:00-14:00 CT as extension or rejection.",
      countdownLabel: "Status",
      countdownISO: null,
      countdownVerb: "",
      imminentLabel: "Ready now",
    };
  }
  return {
    title: "Session complete",
    body:
      "The active ES plan is complete. The next plan starts building at the following 17:00 CT futures open.",
    countdownLabel: "Status",
    countdownISO: null,
    countdownVerb: "",
    imminentLabel: "Complete",
  };
}

function ctTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatSessionDate(sessionDate: string): string {
  const [year, month, day] = sessionDate.split("-").map(Number);
  if (!year || !month || !day) return sessionDate;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0));
  return CT_DATE_FORMAT.format(date).replace(",", "");
}
