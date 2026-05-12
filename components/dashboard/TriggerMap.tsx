"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import type { DynamicLine } from "@/lib/types";
import type { ReactNode } from "react";

type LineReadState = "armed" | "watching" | "reference";

function lineState(distance: number): LineReadState {
  const a = Math.abs(distance);
  if (a <= 0.5) return "armed";
  if (a <= 2.5) return "watching";
  return "reference";
}

function displayValue(line: DynamicLine): number {
  return line.entryValue ?? line.currentValue;
}

function distanceToLast(line: DynamicLine, currentPrice?: number): number {
  const reference = displayValue(line);
  if (typeof currentPrice === "number" && Number.isFinite(currentPrice)) {
    return currentPrice - reference;
  }
  return -line.distanceFromPrice;
}

const lineStyle: Record<string, { dot: string; label: string }> = {
  UA: { dot: "bg-bull", label: "Upper Ascending" },
  UD: { dot: "bg-bear", label: "Upper Descending" },
  LA: { dot: "bg-bull", label: "Lower Ascending" },
  LD: { dot: "bg-bear", label: "Lower Descending" },
  S_ASC: { dot: "bg-bull/60", label: "Secondary Ascending" },
  S_DESC: { dot: "bg-bear/60", label: "Secondary Descending" },
  ANC_ASC: { dot: "bg-bull", label: "Anchor Ascending" },
  ANC_DESC: { dot: "bg-bear", label: "Anchor Descending" },
  PDH: { dot: "bg-violet", label: "Previous RTH high" },
  PDL: { dot: "bg-violet", label: "Previous RTH low" },
  DAY_OPEN: { dot: "bg-gold", label: "Day open diagnostic" },
};

function pillVariant(state: LineReadState) {
  return state === "reference" ? "stale" : state;
}

function LevelCard({
  line,
  meta,
  distance,
  context = false,
}: {
  line: DynamicLine;
  meta: { dot: string; label: string };
  distance: number;
  context?: boolean;
}) {
  const state = lineState(distance);
  return (
    <div className="rounded-soft border border-rule bg-paper-2 px-4 py-3 shadow-rule">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
            {line.name}
          </span>
        </div>
        <StatusPill variant={pillVariant(state)} pulse={state === "armed"}>
          {context ? "context" : state}
        </StatusPill>
      </div>
      <div className="font-mono text-[22px] font-semibold tabular-nums text-ink" data-num>
        {displayValue(line).toFixed(2)}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[12px] text-ink-3">
        <span>{meta.label}</span>
        <span
          className={`font-mono tabular-nums ${
            distance >= 0 ? "text-bull-ink" : "text-bear-ink"
          }`}
        >
          {distance >= 0 ? "+" : ""}
          {distance.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export function TriggerMap({
  lines,
  healthAction,
  currentPrice,
}: {
  lines: DynamicLine[];
  healthAction?: ReactNode;
  currentPrice?: number;
}) {
  const sorted = lines
    .slice()
    .sort((a, b) => Math.abs(distanceToLast(a, currentPrice)) - Math.abs(distanceToLast(b, currentPrice)));

  if (lines.length === 0) {
    return (
      <Card>
        <CardHeader
          eyebrow="Trigger Map"
          title="09:00 references"
          meta="Waiting for qualified structure"
          action={healthAction}
        />
        <CardBody>
          <EmptyState
            title="No qualified levels yet."
            reason="SPY levels arm after the premarket anchor window resolves and the engine has a 09:00 CT reference to evaluate."
            detail="Until then, this panel is intentionally quiet instead of showing placeholder rows."
            kind="waiting"
          />
        </CardBody>
      </Card>
    );
  }
  const pdh = sorted.find((line) => line.kind === "PDH");
  const pdl = sorted.find((line) => line.kind === "PDL");
  const invalidPriorRange = Boolean(
    pdh &&
      pdl &&
      Number.isFinite(displayValue(pdh)) &&
      Number.isFinite(displayValue(pdl)) &&
      displayValue(pdh) < displayValue(pdl),
  );
  const validatedSorted = invalidPriorRange
    ? sorted.filter((line) => line.kind !== "PDH" && line.kind !== "PDL")
    : sorted;
  const actionable = validatedSorted.filter(isActionableReference);
  const context = validatedSorted.filter((line) => !isActionableReference(line));

  return (
    <Card>
      <CardHeader
        eyebrow="Trigger Map"
        title="09:00 references"
        meta="actionable first; context below"
        action={healthAction}
      />
      <CardBody className="px-0 pb-0">
        <div className="px-5 pb-4">
          <p className="max-w-2xl text-[12px] leading-relaxed text-ink-3">
            These are the 09:00 CT operating values. Backup and day-open rows are
            retained as diagnostics, but they are not equal to the active entry
            framework.
          </p>
          {invalidPriorRange && (
            <div className="mt-3 rounded-soft border border-gold/35 bg-gold-tint px-3 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-gold-ink">
              Prior-day range failed validation; PDH/PDL are hidden until the feed
              resolves.
            </div>
          )}
        </div>

        <div className="grid gap-3 px-5 pb-5 sm:hidden">
          {actionable.map((line) => {
            const distance = distanceToLast(line, currentPrice);
            const meta = lineStyle[line.kind] ?? { dot: "bg-ink-3", label: line.kind };
            return (
              <LevelCard key={line.name} line={line} meta={meta} distance={distance} />
            );
          })}
        </div>

        <div className="hidden grid-cols-12 px-5 pb-2 eyebrow text-ink-3 sm:grid">
          <div className="col-span-3">Line</div>
          <div className="col-span-3">Type</div>
          <div className="col-span-2 text-right">09:00 value</div>
          <div className="col-span-2 text-right">LAST - REF</div>
          <div className="col-span-2 text-right">Status</div>
        </div>
        <ul className="hidden divide-y divide-rule border-t border-rule sm:block">
          {actionable.map((line) => {
            const distance = distanceToLast(line, currentPrice);
            const state = lineState(distance);
            const meta = lineStyle[line.kind] ?? { dot: "bg-ink-3", label: line.kind };
            return (
              <li
                key={line.name}
                className="grid grid-cols-12 items-center px-5 py-3 transition-colors hover:bg-paper-2/50"
              >
                <div className="col-span-3 flex items-center gap-2.5">
                  <span className={`h-4 w-1.5 rounded-sm ${meta.dot}`} />
                  <span className="font-mono text-sm font-semibold text-ink">{line.name}</span>
                  {line.isPrimary && (
                    <span className="text-[9px] font-mono text-gold-ink uppercase tracking-[0.10em]">
                      primary
                    </span>
                  )}
                </div>
                <div className="col-span-3 text-xs text-ink-2">{meta.label}</div>
                <div className="col-span-2 text-right font-mono text-sm tabular-nums text-ink" data-num>
                  {displayValue(line).toFixed(2)}
                </div>
                <div
                  className={`col-span-2 text-right font-mono text-sm tabular-nums ${
                    distance >= 0 ? "text-bull-ink" : "text-bear-ink"
                  }`}
                  data-num
                >
                  {distance >= 0 ? "+" : ""}
                  {distance.toFixed(2)}
                </div>
                <div className="col-span-2 flex justify-end">
                  <StatusPill variant={pillVariant(state)} pulse={state === "armed"}>
                    {state}
                  </StatusPill>
                </div>
              </li>
            );
          })}
        </ul>

        {context.length > 0 && (
          <div className="border-t border-rule bg-paper-2/45 px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-ink-3">Context / backup references</div>
                <p className="mt-1 text-[11px] text-ink-3">
                  Diagnostic references only. They should not be read as fresh entry
                  instructions.
                </p>
              </div>
              <StatusPill variant="stale">{context.length} refs</StatusPill>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {context.map((line) => {
                const distance = distanceToLast(line, currentPrice);
                const meta = lineStyle[line.kind] ?? { dot: "bg-ink-3", label: line.kind };
                return (
                  <LevelCard
                    key={line.name}
                    line={line}
                    meta={meta}
                    distance={distance}
                    context
                  />
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function isActionableReference(line: DynamicLine): boolean {
  if (line.kind === "PDH" || line.kind === "PDL") return true;
  if (line.kind === "DAY_OPEN") return false;
  if (/backup/i.test(line.name)) return false;
  return line.isPrimary || /^Anchor\s/i.test(line.name);
}
