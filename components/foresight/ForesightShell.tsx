"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Crosshair,
  Database,
  Gauge,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";

import { FeedHeartbeat } from "@/components/decision-slate/FeedHealthProvider";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PanelState, type PanelStateKind } from "@/components/ui/PanelState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { foresightCopy } from "@/content/foresight/copy";
import { SCENARIO_PRESETS } from "@/lib/foresight/config";
import { cn } from "@/lib/utils";
import type {
  CalibrationRecord,
  ForesightStatus,
  ProjectedLineValue,
  ProjectionLine,
  ProjectionSnapshot,
  ScenarioKind,
} from "@/lib/contracts/foresight";

export function ForesightShell({
  snapshot,
  activeScenarioKeys,
  calibrationRecords,
  mockParam,
}: {
  snapshot: ProjectionSnapshot;
  activeScenarioKeys: ScenarioKind[];
  calibrationRecords: CalibrationRecord[];
  mockParam?: string | null;
}) {
  const stateCopy = foresightCopy.states[snapshot.status];
  const panelState = panelStateFor(snapshot.status, snapshot.matrix.lines.length);

  return (
    <main className="w-full max-w-[1600px] space-y-5 pb-14">
      <Hero snapshot={snapshot} stateCopy={stateCopy} />
      <HeaderTiles snapshot={snapshot} />
      <StatusRow snapshot={snapshot} />

      <SectionLabel number="01">{foresightCopy.sections.projection}</SectionLabel>
      <Card className="overflow-visible">
        <CardHeader
          eyebrow="Projection matrix"
          title="Hour-by-hour structural map"
          meta={`${snapshot.matrix.lines.length} lines · ${snapshot.matrix.hours.length} buckets · ${snapshot.projectionId}`}
          action={<FeedHeartbeat feedId="projection-engine" />}
        />
        <CardBody className="space-y-4">
          <InfoStrip />
          <PanelState
            state={panelState}
            title={panelTitle(snapshot.status)}
            body={stateCopy}
          >
            <ProjectionMatrixTable snapshot={snapshot} />
          </PanelState>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.55fr)]">
        <section className="space-y-3">
          <SectionLabel number="02">{foresightCopy.sections.scenarios}</SectionLabel>
          <ScenariosPanel
            activeScenarioKeys={activeScenarioKeys}
            mockParam={mockParam}
          />
        </section>
        <section className="space-y-3">
          <SectionLabel number="03">{foresightCopy.sections.calibration}</SectionLabel>
          <CalibrationPanel records={calibrationRecords} />
        </section>
      </div>
    </main>
  );
}

function Hero({
  snapshot,
  stateCopy,
}: {
  snapshot: ProjectionSnapshot;
  stateCopy: string;
}) {
  return (
    <header className="rounded-card border border-rule-tier1 bg-paper-tier1 px-5 py-5 shadow-card md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-ink">
            {foresightCopy.hero.eyebrow}
          </div>
          <h1 className="mt-2 font-serif text-display text-ink">
            {foresightCopy.hero.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            {foresightCopy.hero.lede}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={snapshot.status} />
          <span className="rounded-pill border border-rule-strong bg-paper px-3 py-2 font-mono text-[11px] uppercase tracking-[0.10em] text-ink-2">
            {snapshot.sessionId}
          </span>
        </div>
      </div>
      {stateCopy && (
        <p className="mt-4 border-t border-rule-strong pt-3 text-sm leading-relaxed text-ink-2">
          {stateCopy}
        </p>
      )}
    </header>
  );
}

function HeaderTiles({ snapshot }: { snapshot: ProjectionSnapshot }) {
  const nearestNow = nearestCell(snapshot);
  const nextChange = nearestChange(snapshot, nearestNow);
  const drift = snapshot.matrix.last - snapshot.matrix.generatedFromLast;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <MetricTile
        icon={<Activity className="h-4 w-4" aria-hidden />}
        label="LAST + DRIFT"
        value={formatPrice(snapshot.matrix.last)}
        detail={`${signed(drift)} since projection was generated`}
      />
      <MetricTile
        icon={<Crosshair className="h-4 w-4" aria-hidden />}
        label="NEAREST LINE NOW"
        value={nearestNow ? nearestNow.lineCode : "-"}
        detail={
          nearestNow
            ? `${lineLabel(snapshot.matrix.lines, nearestNow.lineId)} · ${formatPrice(nearestNow.value)} · ${signed(nearestNow.deltaFromLast)}`
            : "No projected line is resolved yet"
        }
        foot={nextChange}
      />
      <MetricTile
        icon={<Gauge className="h-4 w-4" aria-hidden />}
        label="PROJECTION FRESHNESS"
        value={formatTime(snapshot.generatedAt)}
        detail={`Next refresh ${formatTime(snapshot.nextRefreshAt)} · tick ${snapshot.sourceLastTick ? formatTime(snapshot.sourceLastTick) : "unknown"}`}
        foot={snapshot.ruleVersion}
      />
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
  foot,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  foot?: string | null;
}) {
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-ink">
              {label}
            </div>
            <div className="num mt-2 font-serif text-headline text-ink">
              {value}
            </div>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-soft border border-rule bg-paper-2 text-ink-2">
            {icon}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{detail}</p>
        {foot && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            {foot}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function StatusRow({ snapshot }: { snapshot: ProjectionSnapshot }) {
  const checks = [
    {
      label: "Date loaded",
      value: snapshot.sessionId,
      ok: true,
    },
    {
      label: "Lines",
      value: `${snapshot.matrix.lines.length}`,
      ok: snapshot.matrix.lines.length > 0,
    },
    {
      label: "Projection built",
      value: snapshot.status === "failed" ? "No" : "Yes",
      ok: snapshot.status !== "failed",
    },
    {
      label: "Next refresh",
      value: formatTime(snapshot.nextRefreshAt),
      ok: snapshot.status === "live",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-card border border-rule bg-paper px-3 py-3 md:grid-cols-4">
      {checks.map((check) => (
        <div key={check.label} className="flex min-w-0 items-center gap-2">
          {check.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-bull" aria-hidden />
          ) : (
            <Clock3 className="h-4 w-4 shrink-0 text-gold" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3">
              {check.label}
            </div>
            <div className="num truncate font-mono text-[12px] text-ink">
              {check.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoStrip() {
  return (
    <div className="rounded-soft border border-gold/25 bg-gold-tint px-4 py-3 text-sm leading-relaxed text-gold-ink">
      {foresightCopy.info}
    </div>
  );
}

function ProjectionMatrixTable({ snapshot }: { snapshot: ProjectionSnapshot }) {
  const rows = snapshot.matrix.lines.map((line, rowIndex) => ({
    line,
    cells: snapshot.matrix.cells[rowIndex] ?? [],
  }));

  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-rule bg-paper lg:block">
        <table
          className="w-full border-collapse text-sm"
          aria-describedby="foresight-freshness"
        >
          <caption className="sr-only">
            Projection matrix for {snapshot.sessionId}. Rows are structural
            lines; columns are Central Time hour buckets.
          </caption>
          <thead>
            <tr className="border-b border-rule bg-paper-2">
              <th
                scope="col"
                className="sticky left-0 z-10 w-56 bg-paper-2 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2"
              >
                Line
              </th>
              {snapshot.matrix.hours.map((hour) => (
                <th
                  key={hour.at}
                  scope="col"
                  className={cn(
                    "min-w-28 px-3 py-3 text-right font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2",
                    hour.isCurrent && "border-l-2 border-gold bg-gold-tint",
                  )}
                >
                  {hour.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-rule">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-paper px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.08em] text-ink"
              >
                LAST
              </th>
              {snapshot.matrix.hours.map((hour) => (
                <td
                  key={hour.at}
                  className={cn(
                    "px-3 py-3 text-right font-mono text-[12px]",
                    hour.isObserved ? "text-ink" : "text-ink-4",
                    hour.isCurrent && "border-l-2 border-gold bg-gold-tint",
                  )}
                >
                  {hour.isObserved ? formatPrice(snapshot.matrix.last) : "-"}
                </td>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map(({ line, cells }) => (
              <tr key={line.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-paper px-4 py-3 text-left"
                >
                  <div className="font-mono text-[12px] text-ink">{line.code}</div>
                  <div className="mt-0.5 max-w-48 truncate text-xs text-ink-3">
                    {line.label}
                  </div>
                </th>
                {cells.map((cell) => (
                  <MatrixCell
                    key={`${cell.lineId}-${cell.hour.at}`}
                    cell={cell}
                    line={line}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id="foresight-freshness" className="sr-only">
        Projection generated at {formatTime(snapshot.generatedAt)} from source
        tick {snapshot.sourceLastTick ? formatTime(snapshot.sourceLastTick) : "unknown"}.
      </div>
      <div className="space-y-3 lg:hidden">
        {snapshot.matrix.hours.map((hour, columnIndex) => {
          const hourCells = rows
            .map(({ line, cells }) => ({ line, cell: cells[columnIndex] }))
            .filter((row): row is { line: ProjectionLine; cell: ProjectedLineValue } => Boolean(row.cell))
            .sort((a, b) => Math.abs(a.cell.deltaFromLast) - Math.abs(b.cell.deltaFromLast));
          return (
            <Card key={hour.at}>
              <CardHeader
                eyebrow={hour.isCurrent ? "Current bucket" : "Hour bucket"}
                title={hour.label}
                meta={hour.isObserved ? "Observed window" : "Projected window"}
              />
              <CardBody className="divide-y divide-rule p-0">
                {hourCells.map(({ line, cell }) => (
                  <div
                    key={cell.lineId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <div className="font-mono text-[12px] text-ink">
                        {line.code} {cell.isNearestForHour ? "nearest" : ""}
                      </div>
                      <div className="text-xs text-ink-3">{line.label}</div>
                    </div>
                    <div className="text-right">
                      <div className="num font-mono text-[13px] text-ink">
                        {formatPrice(cell.value)}
                      </div>
                      <div className="num font-mono text-[11px] text-ink-3">
                        {signed(cell.deltaFromLast)}
                      </div>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function MatrixCell({
  cell,
  line,
}: {
  cell: ProjectedLineValue;
  line: ProjectionLine;
}) {
  const proximity = Math.abs(cell.deltaFromLast);
  const tone =
    cell.isNearestForHour
      ? "bg-gold-tint text-gold-ink"
      : proximity <= 0.75
        ? "bg-teal-tint text-ink"
        : "text-ink-2";
  const title = `${line.code} ${line.label}, ${cell.hour.label}, projected ${formatPrice(
    cell.value,
  )}, ${cell.method}, ${cell.confidence.band} confidence ${cell.confidence.score}/100, ${cell.projectionId}`;

  return (
    <td
      tabIndex={0}
      title={title}
      aria-label={title}
      className={cn(
        "px-3 py-3 text-right outline-none transition focus-visible:ring-2 focus-visible:ring-gold/40",
        cell.hour.isCurrent && "border-l-2 border-gold",
        tone,
      )}
    >
      <div className="flex items-center justify-end gap-1.5">
        {cell.isNearestForHour && (
          <ArrowRight className="h-3.5 w-3.5" aria-label="Nearest line for this hour" />
        )}
        <span className="num font-mono text-[12px]">{formatPrice(cell.value)}</span>
      </div>
      <div className="num mt-1 font-mono text-[10px] opacity-75">
        {signed(cell.deltaFromLast)}
      </div>
    </td>
  );
}

function ScenariosPanel({
  activeScenarioKeys,
  mockParam,
}: {
  activeScenarioKeys: ScenarioKind[];
  mockParam?: string | null;
}) {
  const active = new Set(activeScenarioKeys);

  return (
    <Card>
      <CardHeader
        eyebrow="Assumption toggles"
        title="Stress the projection"
        meta="Scenario changes are derived from the matrix; no server round trip is required for the math."
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {(Object.keys(SCENARIO_PRESETS) as ScenarioKind[]).map((kind) => {
            const preset = SCENARIO_PRESETS[kind];
            const isActive = active.has(kind);
            return (
              <a
                key={kind}
                role="button"
                aria-pressed={isActive}
                href={scenarioHref(activeScenarioKeys, kind, mockParam)}
                className={cn(
                  "block min-h-11 rounded-soft border px-3 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-gold/40",
                  isActive
                    ? "border-gold bg-gold-tint text-gold-ink"
                    : "border-rule bg-paper-2 text-ink-2 hover:border-rule-strong",
                )}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.08em]">
                  {preset.label}
                </div>
                <div className="mt-1 text-xs leading-relaxed">
                  {scenarioDescription(kind)}
                </div>
              </a>
            );
          })}
        </div>
        {activeScenarioKeys.length > 0 && (
          <a
            href={baseHref(mockParam)}
            className="inline-flex min-h-11 items-center gap-2 rounded-soft border border-rule bg-paper px-3 py-2 font-mono text-[11px] uppercase tracking-[0.10em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset to base
          </a>
        )}
      </CardBody>
    </Card>
  );
}

function CalibrationPanel({ records }: { records: CalibrationRecord[] }) {
  if (records.length === 0) {
    return (
      <Card>
        <CardHeader
          eyebrow="Read-only"
          title="Calibration begins after replay"
          meta="0 of 10 minimum records"
          action={<FeedHeartbeat feedId="calibration-store" />}
        />
        <CardBody>
          <PanelState
            state="empty-waiting"
            title="No calibration corpus yet."
            body="Replay will write projection errors after resolved sessions. Until at least 10 sessions exist, Foresight shows the matrix without claiming historical accuracy."
          />
        </CardBody>
      </Card>
    );
  }

  const median =
    records.map((record) => Math.abs(record.errorPts)).sort((a, b) => a - b)[
      Math.floor(records.length / 2)
    ] ?? 0;

  return (
    <Card>
      <CardHeader
        eyebrow="Recent errors"
        title="Calibration"
        meta={`${records.length} projection checks`}
        action={<FeedHeartbeat feedId="calibration-store" />}
      />
      <CardBody className="space-y-3">
        <MetricTile
          icon={<Database className="h-4 w-4" aria-hidden />}
          label="MEDIAN ABS ERROR"
          value={`${median.toFixed(2)} pts`}
          detail="Measured from stored replay records."
        />
      </CardBody>
    </Card>
  );
}

function StatusChip({ status }: { status: ForesightStatus }) {
  const tone = {
    resolving: "border-gold/40 bg-gold-tint text-gold-ink",
    standby: "border-rule-strong bg-paper text-ink-2",
    live: "border-bull/30 bg-bull-tint text-bull-ink",
    stale: "border-gold/40 bg-gold-tint text-gold-ink",
    failed: "border-bear/35 bg-bear-tint text-bear-ink",
  }[status];

  return (
    <span
      title={foresightCopy.states[status]}
      className={cn(
        "inline-flex min-h-11 items-center rounded-pill border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.10em]",
        tone,
      )}
    >
      {status === "failed" && <AlertTriangle className="mr-2 h-3.5 w-3.5" aria-hidden />}
      {status === "stale" && <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />}
      {status}
    </span>
  );
}

function panelStateFor(status: ForesightStatus, lineCount: number): PanelStateKind {
  if (status === "failed") return "failed";
  if (status === "resolving") return lineCount > 0 ? "partial" : "empty-waiting";
  if (status === "standby") return lineCount > 0 ? "ready" : "empty-by-design";
  if (lineCount === 0) return "empty-waiting";
  return "ready";
}

function panelTitle(status: ForesightStatus) {
  if (status === "failed") return "Projection unavailable.";
  if (status === "resolving") return "Projection is resolving.";
  if (status === "standby") return "Standby projection.";
  if (status === "stale") return "Projection is stale.";
  return "Projection is live.";
}

function nearestCell(snapshot: ProjectionSnapshot) {
  const currentIndex = snapshot.matrix.hours.findIndex((hour) => hour.isCurrent);
  const index = currentIndex >= 0 ? currentIndex : 0;
  return snapshot.matrix.cells
    .map((row) => row[index])
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.deltaFromLast) - Math.abs(b.deltaFromLast))[0] ?? null;
}

function nearestChange(
  snapshot: ProjectionSnapshot,
  current: ProjectedLineValue | null,
) {
  if (!current) return null;
  for (let column = 0; column < snapshot.matrix.hours.length; column += 1) {
    const nearest = snapshot.matrix.cells
      .map((row) => row[column])
      .filter(Boolean)
      .sort((a, b) => Math.abs(a.deltaFromLast) - Math.abs(b.deltaFromLast))[0];
    if (nearest && nearest.lineId !== current.lineId) {
      return `${nearest.lineCode} becomes nearest at ${snapshot.matrix.hours[column].label}`;
    }
  }
  return "Nearest line remains stable across visible buckets";
}

function lineLabel(lines: ProjectionLine[], lineId: string) {
  return lines.find((line) => line.id === lineId)?.label ?? lineId;
}

function scenarioDescription(kind: ScenarioKind) {
  const descriptions: Record<ScenarioKind, string> = {
    gamma_flip: "Shift line context by a small dealer-flip assumption.",
    vol_expansion: "Widen projected movement by increasing active slopes.",
    vol_compression: "Compress projected movement by reducing active slopes.",
    trend_continuation: "Extend the current slope impulse a little farther.",
    mean_reversion: "Pull projected values modestly back toward LAST.",
  };
  return descriptions[kind];
}

function scenarioHref(
  activeScenarioKeys: ScenarioKind[],
  kind: ScenarioKind,
  mockParam?: string | null,
) {
  const values = new Set(activeScenarioKeys);
  if (values.has(kind)) values.delete(kind);
  else values.add(kind);
  const params = new URLSearchParams();
  if (mockParam) params.set("mock", mockParam);
  const serialized = Array.from(values).join(",");
  if (serialized) params.set("scenarios", serialized);
  const query = params.toString();
  return query ? `/foresight?${query}` : "/foresight";
}

function baseHref(mockParam?: string | null) {
  if (!mockParam) return "/foresight";
  return `/foresight?${new URLSearchParams({ mock: mockParam }).toString()}`;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function signed(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pts`;
}

function formatTime(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}
