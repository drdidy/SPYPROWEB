"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  EyeOff,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  deskRunOrder,
  deskTierPlan,
  prophetDesks,
  type ProphetDesk,
  type ProphetDeskKey,
} from "@/content/agent-desk";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";

const statusCopy: Record<ProphetDesk["status"], { label: string; cls: string }> = {
  "launch-critical": {
    label: "Ship gate",
    cls: "border-bear/25 bg-bear-tint text-bear-ink",
  },
  active: {
    label: "Active",
    cls: "border-bull/25 bg-bull-tint text-bull-ink",
  },
  watch: {
    label: "Watch",
    cls: "border-gold/30 bg-gold-tint text-gold-ink",
  },
};

export function ProphetDeskClient() {
  const [selectedKey, setSelectedKey] = useState<ProphetDeskKey>("calibration");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [runPulse, setRunPulse] = useState(false);
  const selected = prophetDesks.find((desk) => desk.key === selectedKey) ?? prophetDesks[0];
  const visibleDesks = useMemo(
    () =>
      criticalOnly
        ? prophetDesks.filter((desk) => desk.status === "launch-critical")
        : prophetDesks,
    [criticalOnly],
  );

  function simulateRun() {
    setRunPulse(true);
    window.setTimeout(() => setRunPulse(false), 1400);
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[20px] border border-[#18343D] bg-[#061218] text-paper shadow-[0_28px_70px_-44px_rgba(0,0,0,0.95)]">
        <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(244,228,192,0.17),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(20,176,150,0.16),transparent_24%)]"
          />
          <div className="relative p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-gold-soft">
                Private research desk
              </span>
              <span className="rounded-full border border-paper/10 bg-paper/[0.055] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/62">
                10 desks wired
              </span>
            </div>
            <h2 className="mt-5 max-w-3xl font-serif text-[42px] leading-[0.95] tracking-tight text-paper md:text-[58px]">
              The app now has a quality desk behind every decision.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-paper/70">
              These desks do not expose the method. They audit the maps,
              replay the day, tighten the language, and block weak releases
              before they reach production.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={simulateRun}
                className="inline-flex h-11 items-center gap-2 rounded-[9px] bg-gold-soft px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#071116] transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft/60"
              >
                <Play size={14} />
                Run desk preview
              </button>
              <button
                type="button"
                onClick={() => setCriticalOnly((value) => !value)}
                className="inline-flex h-11 items-center gap-2 rounded-[9px] border border-paper/15 bg-paper/[0.055] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-paper/78 transition hover:bg-paper/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft/45"
              >
                <ShieldCheck size={14} />
                {criticalOnly ? "Show all desks" : "Ship gates only"}
              </button>
            </div>
          </div>
          <div className="relative border-t border-paper/10 bg-paper/[0.035] p-5 lg:border-l lg:border-t-0 md:p-7">
            <div className={cn("rounded-[16px] border border-paper/12 bg-[#091B22]/88 p-4 transition", runPulse && "ring-2 ring-gold-soft/60")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft/75">
                    Next release gate
                  </div>
                  <div className="mt-2 font-serif text-[30px] leading-none text-paper">
                    Product QA
                  </div>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-[11px] border border-gold/25 bg-gold/10 text-gold-soft">
                  <CheckCircle2 size={18} />
                </span>
              </div>
              <div className="mt-5 space-y-2">
                {[
                  "Data consistency",
                  "Visual overlap",
                  "Copy exposure",
                  "Mobile readability",
                ].map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-[10px] border border-paper/10 bg-paper/[0.045] px-3 py-2"
                  >
                    <span className="text-[12px] text-paper/72">{item}</span>
                    <span
                      className={cn(
                        "h-1.5 rounded-full bg-gold-soft transition-all",
                        runPulse ? "w-24" : index === 0 ? "w-20" : "w-14",
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionLabel number="01">Agent desks</SectionLabel>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-3 md:grid-cols-2">
          {visibleDesks.map((desk) => (
            <DeskButton
              key={desk.key}
              desk={desk}
              selected={selected.key === desk.key}
              onClick={() => setSelectedKey(desk.key)}
            />
          ))}
        </div>
        <DeskDetail desk={selected} />
      </div>

      <SectionLabel number="02">Run sequence</SectionLabel>
      <div className="grid gap-3 lg:grid-cols-5">
        {deskRunOrder.map((key, index) => {
          const desk = prophetDesks.find((item) => item.key === key)!;
          return (
            <div
              key={key}
              className="rounded-[14px] border border-rule bg-paper p-4 shadow-rule"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index < deskRunOrder.length - 1 && (
                  <ArrowRight size={14} className="hidden text-ink-4 lg:block" />
                )}
              </div>
              <div className="mt-3 font-serif text-[22px] leading-none text-ink">
                {desk.label}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                {desk.cadence}
              </p>
            </div>
          );
        })}
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <SectionLabel number="03">Morning battle card</SectionLabel>
          <Card className="mt-4">
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["Line in the sand", "The one level that defines the open."],
                  ["Two valid trades", "Buy-bottom and sell-top paths only."],
                  ["Invalidation", "What cancels the read immediately."],
                  ["Do not chase", "The price stretch that makes the setup late."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-[12px] border border-rule bg-paper-2/55 p-4">
                    <div className="font-serif text-[24px] leading-none text-ink">{title}</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{body}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
        <div>
          <SectionLabel number="04">Access model</SectionLabel>
          <div className="mt-4 space-y-3">
            {deskTierPlan.map((tier) => (
              <Card key={tier.name}>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-serif text-[24px] leading-none text-ink">{tier.name}</div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                        {tier.audience}
                      </div>
                    </div>
                    <LockKeyhole size={15} className="mt-1 text-gold-ink" />
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{tier.access}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <div className="relative z-10 clear-both pt-2">
        <SectionLabel number="05">Private-method firewall</SectionLabel>
      </div>
      <Card tone="gold" className="mt-4">
        <CardBody>
          <div className="grid gap-4 md:grid-cols-[42px_1fr_auto] md:items-center">
            <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-gold/35 bg-paper text-gold-ink">
              <EyeOff size={17} />
            </span>
            <div>
              <div className="font-serif text-[28px] leading-none text-ink">
                Trader output stays simple. The method stays private.
              </div>
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                The public app shows the actionable read, the valid paths, and
                the risk state. The desk keeps raw tuning, rejected models,
                connection plumbing, and release QA evidence behind the curtain.
              </p>
            </div>
            <div className="rounded-[10px] border border-gold/30 bg-paper px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gold-ink">
              Protected
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function DeskButton({
  desk,
  selected,
  onClick,
}: {
  desk: ProphetDesk;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = desk.icon;
  const status = statusCopy[desk.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-[14px] border bg-paper p-4 text-left shadow-rule transition hover:-translate-y-0.5 hover:border-rule-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
        selected ? "border-gold/55 ring-1 ring-gold/35" : "border-rule",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-rule bg-paper-2 text-gold-ink">
          <Icon size={17} />
        </span>
        <span className={cn("rounded-[7px] border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.13em]", status.cls)}>
          {status.label}
        </span>
      </div>
      <div className="mt-4 font-serif text-[26px] leading-none text-ink">{desk.name}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        {desk.label}
      </div>
      <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink-2">
        {desk.firstJob}
      </p>
    </button>
  );
}

function DeskDetail({ desk }: { desk: ProphetDesk }) {
  const Icon = desk.icon;
  const status = statusCopy[desk.status];
  return (
    <Card className="sticky top-5 self-start">
      <CardHeader
        eyebrow="Quality desk"
        title={desk.name}
        meta={desk.cadence}
        action={
          <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-rule bg-paper-2 text-gold-ink">
            <Icon size={17} />
          </span>
        }
      />
      <CardBody>
        <span className={cn("inline-flex rounded-[7px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]", status.cls)}>
          {status.label}
        </span>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          {desk.firstJob}
        </p>
        <div className="mt-5 space-y-2">
          {desk.privateChecks.map((check) => (
            <div key={check} className="flex items-center gap-3 rounded-[10px] border border-rule bg-paper-2/55 px-3 py-2">
              <Sparkles size={13} className="text-gold-ink" />
              <span className="text-[12px] text-ink-2">{publicCheckLabel(check)}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-[12px] border border-rule bg-paper px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            <Clock3 size={13} />
            Product output
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink">{desk.productOutput}</p>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-gold-ink">
            Surface: {desk.linkedSurface}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function publicCheckLabel(value: string): string {
  return value
    .replace(/Schwab broker feed status/gi, "Primary market connection")
    .replace(/Provider and calibration leaks/gi, "Private-method exposure")
    .replace(/provider plumbing/gi, "connection plumbing")
    .replace(/future calibration/gi, "future tuning")
    .replace(/calibration/gi, "quality")
    .replace(/slope drift/gi, "map drift")
    .replace(/gate behavior/gi, "map behavior");
}
