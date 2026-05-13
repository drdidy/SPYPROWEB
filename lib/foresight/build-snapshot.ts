import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { LineCode, LineType } from "@/lib/contracts/channel";
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
  const lines = rawLines
    .map(toProjectionLine)
    .slice(0, mock === "foresight:live-dense" ? 12 : 12);
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
  engine: "spy";
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
