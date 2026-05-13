import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { Engine, LineCode, LineType } from "@/lib/contracts/channel";
import { ProjectionSnapshot as ProjectionSnapshotSchema } from "@/lib/contracts/foresight";
import type {
  ForesightStatus,
  HourBucket,
  ProjectedLineValue,
  ProjectionConfidence,
  ProjectionLine,
  ProjectionMatrix,
  ProjectionSnapshot,
  ScenarioInput,
} from "@/lib/contracts/foresight";
import type { DynamicLine } from "@/lib/types";
import type { SPXLine, SPXSnapshot } from "@/lib/types";
import {
  currentPrice as mockCurrentPrice,
  lines as mockLines,
} from "@/lib/mock-data";

import {
  FORESIGHT_CONFIDENCE_THRESHOLDS,
  FORESIGHT_HOUR_BUCKETS_CT,
  FORESIGHT_RULE_VERSION,
  PROJECTION_METHOD_BY_LINE_TYPE,
} from "./config";

const CT_TIME_ZONE = "America/Chicago";

export function buildForesightSnapshot({
  snap,
  source,
  mock,
  activeScenarios = [],
}: {
  snap: AdaptedSnapshot;
  source: string;
  mock?: string | null;
  activeScenarios?: ScenarioInput[];
}): ProjectionSnapshot {
  const generatedAt = snap.asOf || new Date().toISOString();
  const now = new Date(generatedAt);
  const sessionId = toCtSessionId(now);
  const projectionId = `proj_spy_${sessionId.replaceAll("-", "")}_${hashSeed(generatedAt)}`;
  const hours = buildHourBuckets(now, sessionId);
  const rawLines = shouldUseMockLines(mock, snap.lines.length) ? mockLines : snap.lines;
  const last = shouldUseMockLines(mock, snap.lines.length)
    ? mockCurrentPrice
    : snap.currentPrice;
  const selectedRawLines = selectSpyForesightLines(rawLines, mock);
  const lines = selectedRawLines
    .map(toProjectionLine)
    .slice(0, mock === "foresight:live-dense" ? 12 : 6);
  const status = resolveStatus({ mock, source, lineCount: lines.length, generatedAt });
  const adjustedLines = activeScenarios.length
    ? lines.map((line) => applyScenarios(line, activeScenarios, last))
    : lines;
  const matrix = buildMatrix({
    engine: "spy",
    sessionId,
    last,
    generatedAt,
    projectionId,
    hours,
    lines: adjustedLines,
  });

  return ProjectionSnapshotSchema.parse({
    status,
    engine: "spy",
    sessionId,
    matrix,
    generatedAt,
    ruleVersion: FORESIGHT_RULE_VERSION,
    sourceLastTick: snap.shellState?.feedHealth?.lastTickTs ?? generatedAt,
    nextRefreshAt: new Date(
      Date.parse(generatedAt) + FORESIGHT_CONFIDENCE_THRESHOLDS.refreshMs,
    ).toISOString(),
    projectionId,
    diagnostics: diagnosticsFor(status, lines.length),
  });
}

export function buildEsForesightSnapshot({
  snap,
  source,
  mock,
  activeScenarios = [],
}: {
  snap: SPXSnapshot;
  source: string;
  mock?: string | null;
  activeScenarios?: ScenarioInput[];
}): ProjectionSnapshot {
  const generatedAt = snap.asOf || new Date().toISOString();
  const sessionId = snap.sessionDateCT || toCtSessionId(new Date(generatedAt));
  const projectionId = `proj_es_${sessionId.replaceAll("-", "")}_${hashSeed(generatedAt)}`;
  const hours = buildHourBuckets(new Date(generatedAt), sessionId);
  const rawLines = selectEsForesightLines(snap.lines);
  const lines = rawLines.map(toEsProjectionLine).slice(0, 6);
  const last = snap.price.last;
  const status = resolveStatus({ mock, source, lineCount: lines.length, generatedAt });
  const adjustedLines = activeScenarios.length
    ? lines.map((line) => applyScenarios(line, activeScenarios, last))
    : lines;
  const matrix = buildMatrix({
    engine: "es",
    sessionId,
    last,
    generatedAt,
    projectionId,
    hours,
    lines: adjustedLines,
  });

  return ProjectionSnapshotSchema.parse({
    status,
    engine: "es",
    sessionId,
    matrix,
    generatedAt,
    ruleVersion: FORESIGHT_RULE_VERSION,
    sourceLastTick: snap._meta?.quoteCapturedAt ?? snap.asOf ?? generatedAt,
    nextRefreshAt: new Date(
      Date.parse(generatedAt) + FORESIGHT_CONFIDENCE_THRESHOLDS.refreshMs,
    ).toISOString(),
    projectionId,
    diagnostics: diagnosticsFor(status, lines.length),
  });
}

function shouldUseMockLines(mock: string | null | undefined, lineCount: number) {
  return Boolean(mock?.startsWith("foresight:") && mock !== "foresight:failed" && lineCount === 0);
}

function buildMatrix({
  engine,
  sessionId,
  last,
  generatedAt,
  projectionId,
  hours,
  lines,
}: {
  engine: Engine;
  sessionId: string;
  last: number;
  generatedAt: string;
  projectionId: string;
  hours: HourBucket[];
  lines: ProjectionLine[];
}): ProjectionMatrix {
  const cells = lines.map((line) =>
    hours.map((hour) => {
      const projected = projectedValue(line, generatedAt, hour.at);
      return {
        projectionId,
        lineId: line.id,
        lineCode: line.code,
        hour,
        value: projected,
        deltaFromLast: projected - last,
        confidence: confidenceFor(line, hour),
        method: PROJECTION_METHOD_BY_LINE_TYPE[line.type],
        isExtrapolated: !hour.isObserved,
        isNearestForHour: false,
      };
    }),
  );

  for (let column = 0; column < hours.length; column += 1) {
    let nearest: { row: number; distance: number } | null = null;
    for (let row = 0; row < cells.length; row += 1) {
      const distance = Math.abs(cells[row][column].deltaFromLast);
      if (!nearest || distance < nearest.distance) nearest = { row, distance };
    }
    if (nearest) {
      cells[nearest.row][column] = {
        ...cells[nearest.row][column],
        isNearestForHour: true,
      };
    }
  }

  return {
    engine,
    sessionId,
    last,
    generatedFromLast: last,
    hours,
    lines,
    cells,
  };
}

function selectSpyForesightLines(lines: DynamicLine[], mock: string | null | undefined): DynamicLine[] {
  if (mock === "foresight:live-dense") return lines;
  const seen = new Set<string>();
  const add = (out: DynamicLine[], line: DynamicLine | undefined) => {
    if (!line) return;
    const key = `${line.kind}:${line.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };
  const out: DynamicLine[] = [];
  const primaryAnchors = lines.filter(
    (line) =>
      (line.kind === "ANC_ASC" || line.kind === "ANC_DESC") &&
      line.isPrimary &&
      !/backup|secondary/i.test(line.name),
  );
  const fallbackAnchors = lines.filter(
    (line) =>
      (line.kind === "ANC_ASC" || line.kind === "ANC_DESC") &&
      !/backup|secondary/i.test(line.name),
  );
  for (const line of (primaryAnchors.length ? primaryAnchors : fallbackAnchors).slice(0, 3)) {
    add(out, line);
  }
  add(out, lines.find((line) => line.kind === "PDH"));
  add(out, lines.find((line) => line.kind === "PDL"));
  add(out, lines.find((line) => line.kind === "DAY_OPEN"));
  for (const line of lines) {
    if (out.length >= 6) break;
    if (/backup|secondary/i.test(line.name)) continue;
    add(out, line);
  }
  return out.slice(0, 6);
}

function selectEsForesightLines(lines: SPXLine[]): SPXLine[] {
  const order = [
    "PREV_RTH_HIGH_ASC",
    "PREV_RTH_HIGH_DESC",
    "PREV_RTH_LOW_ASC",
    "PREV_RTH_LOW_DESC",
  ];
  return order
    .map((kind) => lines.find((line) => line.kind === kind))
    .filter((line): line is SPXLine => Boolean(line));
}

function toEsProjectionLine(line: SPXLine): ProjectionLine {
  const codeByKind: Record<string, LineCode> = {
    PREV_RTH_HIGH_ASC: "UR",
    PREV_RTH_HIGH_DESC: "UD",
    PREV_RTH_LOW_ASC: "LA",
    PREV_RTH_LOW_DESC: "LR",
    SWING_HIGH_ASC: "UA",
    SWING_HIGH_DESC: "UD",
    SWING_LOW_ASC: "LA",
    SWING_LOW_DESC: "LD",
  };
  return {
    id: stableId(line.kind, 0),
    code: codeByKind[line.kind] ?? "MR",
    type: line.slopePerHour === 0 ? "horizontal" : line.slopePerHour > 0 ? "ascending" : "descending",
    label: esLineLabel(line.kind),
    sourceName: line.name || line.kind,
    slopePerHour: Number.isFinite(line.slopePerHour) ? line.slopePerHour : 0,
    currentValue: Number.isFinite(line.currentValue) ? line.currentValue : line.anchorPrice,
  };
}

function esLineLabel(kind: string): string {
  const labels: Record<string, string> = {
    PREV_RTH_HIGH_ASC: "Previous RTH high ascending",
    PREV_RTH_HIGH_DESC: "Previous RTH high descending",
    PREV_RTH_LOW_ASC: "Previous RTH low ascending",
    PREV_RTH_LOW_DESC: "Previous RTH low descending",
    SWING_HIGH_ASC: "Swing high ascending",
    SWING_HIGH_DESC: "Swing high descending",
    SWING_LOW_ASC: "Swing low ascending",
    SWING_LOW_DESC: "Swing low descending",
  };
  return labels[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

function projectedValue(line: ProjectionLine, generatedAt: string, at: string) {
  const deltaHours = (Date.parse(at) - Date.parse(generatedAt)) / 3_600_000;
  if (!Number.isFinite(deltaHours)) return line.currentValue;
  if (PROJECTION_METHOD_BY_LINE_TYPE[line.type] === "held_flat") return line.currentValue;
  return line.currentValue + line.slopePerHour * deltaHours;
}

function confidenceFor(line: ProjectionLine, hour: HourBucket): ProjectionConfidence {
  const slopePenalty = Math.min(15, Math.abs(line.slopePerHour) * 4);
  const timePenalty = hour.isObserved ? 0 : 8;
  const score = Math.max(35, Math.round(88 - slopePenalty - timePenalty));
  const band =
    score >= FORESIGHT_CONFIDENCE_THRESHOLDS.high
      ? "high"
      : score >= FORESIGHT_CONFIDENCE_THRESHOLDS.medium
        ? "medium"
        : "low";
  return { band, score };
}

function toProjectionLine(line: DynamicLine, index: number): ProjectionLine {
  const code = lineCode(line, index);
  const type = lineType(line);
  return {
    id: stableId(line.name, index),
    code,
    type,
    label: labelFor(line, code),
    sourceName: line.name,
    slopePerHour: Number.isFinite(line.slopePerHour) ? line.slopePerHour : 0,
    currentValue: line.currentValue,
  };
}

function lineCode(line: DynamicLine, index: number): LineCode {
  if (["UA", "UD", "LA", "LD"].includes(line.kind)) return line.kind as LineCode;
  if (line.kind === "DAY_OPEN") return "MR";
  if (line.kind === "PDH") return "UR";
  if (line.kind === "PDL") return "LR";
  if (line.kind === "ANC_ASC" || line.kind === "ANC_DESC") {
    return line.isPrimary || index === 0 ? "PR" : "A2";
  }
  if (line.kind === "S_ASC") return "UA";
  if (line.kind === "S_DESC") return "UD";
  return line.isPrimary ? "PR" : "MR";
}

function lineType(line: DynamicLine): LineType {
  if (line.kind === "PDH" || line.kind === "PDL" || line.kind === "DAY_OPEN") {
    return "horizontal";
  }
  if (line.kind === "ANC_ASC" || line.kind === "ANC_DESC") return "anchor";
  if (line.kind === "S_ASC" || line.kind === "S_DESC") return "rail";
  return line.direction === "ASCENDING" ? "ascending" : "descending";
}

function labelFor(line: DynamicLine, code: LineCode) {
  const dictionary: Record<LineCode, string> = {
    UA: "Upper ascending",
    UD: "Upper descending",
    LA: "Lower ascending",
    LD: "Lower descending",
    PR: "Primary anchor",
    A2: "Anchor 2",
    UR: "Upper rail",
    LR: "Lower rail",
    MR: "Main rail",
  };
  return `${dictionary[code]} · ${line.name}`;
}

function stableId(name: string, index: number) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `line_${slug}` : `line_${index}`;
}

function buildHourBuckets(now: Date, sessionId: string): HourBucket[] {
  const currentMs = now.getTime();
  return FORESIGHT_HOUR_BUCKETS_CT.map((time) => {
    const at = ctWallTimeToIso(sessionId, time);
    const ms = Date.parse(at);
    const label = `${time} CT`;
    return {
      at,
      label,
      isCurrent: Math.abs(ms - currentMs) < 45 * 60_000,
      isObserved: ms <= currentMs,
    };
  });
}

function ctWallTimeToIso(sessionId: string, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const [year, month, day] = sessionId.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = Date.UTC(year, month - 1, day, hour + 6, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const rendered = ctParts(new Date(utc));
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      0,
    );
    utc += desired - renderedAsUtc;
  }
  return new Date(utc).toISOString();
}

function ctParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function toCtSessionId(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function resolveStatus({
  mock,
  source,
  lineCount,
  generatedAt,
}: {
  mock?: string | null;
  source: string;
  lineCount: number;
  generatedAt: string;
}): ForesightStatus {
  if (mock === "foresight:resolving") return "resolving";
  if (mock === "foresight:standby") return "standby";
  if (mock === "foresight:stale") return "stale";
  if (mock === "foresight:failed") return "failed";
  if (source === "error") return "failed";
  if (lineCount === 0) return "resolving";
  if (!isProjectionWindow(generatedAt)) return "standby";
  const ageMs = Date.now() - Date.parse(generatedAt);
  if (Number.isFinite(ageMs) && ageMs > FORESIGHT_CONFIDENCE_THRESHOLDS.staleMs) {
    return "stale";
  }
  return "live";
}

function isProjectionWindow(iso: string): boolean {
  const date = new Date(iso);
  const parts = ctParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_TIME_ZONE,
    weekday: "short",
  }).format(date);
  if (day === "Sat" || day === "Sun") return false;
  return minutes >= 3 * 60 && minutes <= 15 * 60 + 15;
}

function diagnosticsFor(status: ForesightStatus, lineCount: number) {
  if (status === "failed") {
    return {
      message: "Projection engine did not return a usable snapshot.",
      waitingOn: ["projection engine"],
    };
  }
  if (status === "resolving") {
    return {
      message:
        lineCount === 0
          ? "Awaiting qualified structural lines before building today's matrix."
          : "Today's projection is still resolving against the latest inputs.",
      waitingOn: lineCount === 0 ? ["anchor levels", "trigger lines"] : ["refresh cycle"],
    };
  }
  if (status === "standby") {
    return {
      message: "Outside the active resolution window.",
      waitingOn: ["next market session"],
    };
  }
  if (status === "stale") {
    return {
      message: "Projection is older than its scheduled refresh.",
      waitingOn: ["next successful refresh"],
    };
  }
  return { message: null, waitingOn: [] };
}

function hashSeed(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function applyScenarios(
  line: ProjectionLine,
  scenarios: ScenarioInput[],
  last: number,
): ProjectionLine {
  let next = { ...line };
  for (const scenario of scenarios) {
    if (scenario.kind === "gamma_flip") {
      next.currentValue += scenario.shiftPts;
    }
    if (scenario.kind === "vol_expansion") {
      next.slopePerHour *= scenario.multiplier;
    }
    if (scenario.kind === "vol_compression") {
      next.slopePerHour *= scenario.multiplier;
    }
    if (scenario.kind === "trend_continuation") {
      next.slopePerHour += Math.sign(next.slopePerHour || 1) * scenario.slopeBoost;
    }
    if (scenario.kind === "mean_reversion") {
      next.currentValue = next.currentValue + (last - next.currentValue) * scenario.pullPct;
    }
  }
  return next;
}
