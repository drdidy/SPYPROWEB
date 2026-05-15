"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { RiskGuardrailState } from "@/lib/types";
import { CalendarClock, Gauge, RotateCcw, Shield } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

const variantMap = {
  OK: "ok",
  INTACT: "intact",
  WAITING: "waiting",
  BROKEN: "broken",
  MISSED_ENTRY: "breached",
} as const;

export function RiskGuardrails({
  state,
  healthAction,
}: {
  state: RiskGuardrailState;
  healthAction?: ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rows = [
    { key: "chase", label: "Chase Guard", icon: Gauge, value: state.chase, rule: "Blocks chasing after price moves too far beyond the planned entry." },
    { key: "retest", label: "Retest", icon: RotateCcw, value: state.retest, rule: "Watches whether price returns to the rejected line before confirmation." },
    { key: "structure", label: "Structure", icon: Shield, value: state.structure, rule: "Fails when the close breaks the line that justified the setup." },
    { key: "daily", label: "Daily Risk", icon: CalendarClock, value: state.daily, rule: "Limits fresh entries once the daily signal budget or grade threshold is spent." },
  ];
  return (
    <Card>
      <CardHeader
        eyebrow="Risk Guardrails"
        title="Why we are (or aren't) trading"
        action={healthAction}
      />
      <CardBody className="space-y-3">
        {rows.map((r) => {
          const Icon = r.icon;
          const variant =
            variantMap[r.value.status as keyof typeof variantMap] ?? "stale";
          return (
            <div key={r.key} className="rounded-soft border border-rule bg-paper-2/60">
              <button
                type="button"
                onClick={() => setOpenKey(openKey === r.key ? null : r.key)}
                className="flex w-full items-start gap-3 px-3 py-3 text-left outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-gold/40"
                aria-expanded={openKey === r.key}
              >
                <div className="shrink-0 w-8 h-8 rounded-soft bg-paper grid place-items-center text-ink-2 shadow-rule">
                  <Icon size={18} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-ink">{r.label}</span>
                    <StatusPill
                      variant={variant as Parameters<typeof StatusPill>[0]["variant"]}
                    >
                      {r.value.status}
                    </StatusPill>
                  </div>
                  <p className="text-[12px] text-ink-2 leading-snug">{r.value.detail}</p>
                </div>
              </button>
              {openKey === r.key && (
                <div className="border-t border-rule px-3 py-3 text-[12px] leading-relaxed text-ink-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                    Rule
                  </div>
                  <p className="mt-1">{r.rule}</p>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                    Current input
                  </div>
                  <p className="mt-1">{r.value.detail}</p>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
