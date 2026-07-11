"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { DynamicLine } from "@/lib/types";
import { useState, type ReactNode } from "react";

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
    return reference - currentPrice;
  }
  return line.distanceFromPrice;
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
  CONTROL: { dot: "bg-gold", label: "Control Line" },
  NORTH_GATE: { dot: "bg-bear", label: "North Gate" },
  SOUTH_GATE: { dot: "bg-bull", label: "South Gate" },
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
  selected = false,
  onSelect,
}: {
  line: DynamicLine;
  meta: { dot: string; label: string };
  distance: number;
  context?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const state = lineState(distance);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-soft border px-4 py-3 text-left shadow-rule outline-none transition hover:-translate-y-0.5 hover:bg-paper focus-visible:ring-2 focus-visible:ring-gold/40 ${
        selected ? "border-gold bg-gold-tint" : "border-rule bg-paper-2"
      }`}
    >
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
            distance >= 0 ? "text-bear-ink" : "text-bull-ink"
          }`}
        >
          {distance >= 0 ? "+" : ""}
          {distance.toFixed(2)}
        </span>
      </div>
    </button>
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
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const sorted = lines
    .slice()
    .sort((a, b) => Math.abs(distanceToLast(a, currentPrice)) - Math.abs(distanceToLast(b, currentPrice)));
  const priorRangeValid = isPriorRangeValid(sorted);
  const validatedSorted = priorRangeValid
    ? sorted
    : sorted.filter((line) => line.kind !== "PDH" && line.kind !== "PDL");
  const actionable = validatedSorted.filter(isActionableReference);
  const context = validatedSorted.filter((line) => !isActionableReference(line));
  const selectedLine =
    validatedSorted.find((line) => line.name === selectedName) ??
    actionable[0] ??
    context[0] ??
    null;

  if (lines.length === 0) {
    return (
      <Card>
        <CardHeader
          eyebrow="Trigger Map"
          title="Control Room"
          meta="Waiting for qualified structure"
          action={healthAction}
        />
        <CardBody>
          <div className="rounded-soft border border-rule bg-paper-2 px-4 py-5">
            <div className="font-serif text-headline text-ink-2 italic font-light">
              No qualified levels yet.
            </div>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-ink-3">
              SPY levels arm after the prior-session Control Line resolves.
              Until then, this panel is intentionally quiet.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Trigger Map"
        title="Control Room"
        meta="actionable first; context below"
        action={healthAction}
      />
      <CardBody className="px-0 pb-0">
        <div className="px-5 pb-4">
          <p className="max-w-2xl text-[12px] leading-relaxed text-ink-3">
            These are the Control Room reference values. Backup and day-open rows are
            retained as context, but the Control Line and gates are the active
            entry framework.
          </p>
          {!priorRangeValid && (
            <div className="mt-3 rounded-soft border border-gold/30 bg-gold-tint px-3 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-gold-ink">
              Prior-day range failed validation; PDH/PDL are hidden until the feed resolves.
            </div>
          )}
        </div>

        <div className="grid gap-3 px-5 pb-5 sm:hidden">
          {actionable.map((line) => {
            const distance = distanceToLast(line, currentPrice);
            const meta = lineStyle[line.kind] ?? { dot: "bg-ink-3", label: line.kind };
            return (
              <LevelCard
                key={line.name}
                line={line}
                meta={meta}
                distance={distance}
                selected={selectedLine?.name === line.name}
                onSelect={() => setSelectedName(line.name)}
              />
            );
          })}
        </div>

        <div className="hidden grid-cols-12 px-5 pb-2 eyebrow text-ink-3 sm:grid">
          <div className="col-span-3">Line</div>
          <div className="col-span-3">Type</div>
          <div className="col-span-2 text-right">Reference</div>
          <div className="col-span-2 text-right">Delta to last</div>
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
                className={`grid grid-cols-12 items-center px-5 py-3 transition-colors ${
                  selectedLine?.name === line.name ? "bg-gold-tint/70" : "hover:bg-paper-2/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedName(line.name)}
                  className="col-span-3 flex items-center gap-2.5 rounded-soft text-left outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
                  aria-pressed={selectedLine?.name === line.name}
                >
                  <span className={`h-4 w-1.5 rounded-sm ${meta.dot}`} />
                  <span className="font-mono text-sm font-semibold text-ink">{line.name}</span>
                  {line.isPrimary && (
                    <span className="text-[9px] font-mono text-gold-ink uppercase tracking-[0.10em]">
                      primary
                    </span>
                  )}
                </button>
                <div className="col-span-3 text-xs text-ink-2">{meta.label}</div>
                <div className="col-span-2 text-right font-mono text-sm tabular-nums text-ink" data-num>
                  {displayValue(line).toFixed(2)}
                </div>
                <div
                  className={`col-span-2 text-right font-mono text-sm tabular-nums ${
                    distance >= 0 ? "text-bear-ink" : "text-bull-ink"
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
                    selected={selectedLine?.name === line.name}
                    onSelect={() => setSelectedName(line.name)}
                  />
                );
              })}
            </div>
          </div>
        )}
        {selectedLine && (
          <div className="border-t border-rule bg-paper px-5 py-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
              <div>
                <div className="eyebrow text-ink-3">Selected level</div>
                <div className="mt-1 font-serif text-[24px] leading-tight text-ink">
                  {selectedLine.name}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                  {lineStyle[selectedLine.kind]?.label ?? selectedLine.kind}. This row is ready for inspection; use the distance to decide whether it is actionable or only context.
                </p>
              </div>
              <div className="rounded-[10px] border border-rule bg-paper-2 px-3 py-2 text-right">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Delta</div>
                <div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-gold-ink">
                  {distanceToLast(selectedLine, currentPrice) >= 0 ? "+" : ""}
                  {distanceToLast(selectedLine, currentPrice).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function isActionableReference(line: DynamicLine): boolean {
  if (line.kind === "CONTROL" || line.kind === "NORTH_GATE" || line.kind === "SOUTH_GATE") return true;
  if (line.kind === "PDH" || line.kind === "PDL") return false;
  if (line.kind === "DAY_OPEN") return false;
  if (/backup/i.test(line.name)) return false;
  return line.isPrimary || /^Anchor\s/i.test(line.name);
}

function isPriorRangeValid(lines: DynamicLine[]): boolean {
  const pdh = lines.find((line) => line.kind === "PDH");
  const pdl = lines.find((line) => line.kind === "PDL");
  if (!pdh || !pdl) return true;
  return displayValue(pdh) >= displayValue(pdl);
}
