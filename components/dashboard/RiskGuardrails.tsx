"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { RiskGuardrailState } from "@/lib/types";
import { Shield, Zap, Layers, Calendar } from "lucide-react";

const variantMap = {
  OK: "ok",
  INTACT: "intact",
  WAITING: "waiting",
  BROKEN: "broken",
  MISSED_ENTRY: "breached",
} as const;

export function RiskGuardrails({ state }: { state: RiskGuardrailState }) {
  const rows = [
    { key: "chase", label: "Chase Guard", icon: Zap, value: state.chase },
    { key: "retest", label: "Retest", icon: Layers, value: state.retest },
    { key: "structure", label: "Structure", icon: Shield, value: state.structure },
    { key: "daily", label: "Daily Risk", icon: Calendar, value: state.daily },
  ];
  return (
    <Card>
      <CardHeader eyebrow="Risk Guardrails" title="Why we are (or aren't) trading" />
      <CardBody className="space-y-3">
        {rows.map((r) => {
          const Icon = r.icon;
          const variant =
            variantMap[r.value.status as keyof typeof variantMap] ?? "stale";
          return (
            <div key={r.key} className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-soft bg-paper-2 grid place-items-center text-ink-2 shadow-rule">
                <Icon size={14} />
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
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
