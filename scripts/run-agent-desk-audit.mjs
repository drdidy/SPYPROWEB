import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outputDir = join(root, ".data");
const outputPath = join(outputDir, "agent-desk-audit.json");

const watchedGlobs = [
  "app",
  "components",
  "content",
  "lib",
  "stocks",
].filter((path) => existsSync(join(root, path)));

const textFiles = listFiles(watchedGlobs).filter((file) =>
  existsSync(file) && /\.(ts|tsx|json|md|mjs|css)$/.test(file),
);

const scans = [
  {
    desk: "Data Trust",
    severity: "ship-gate",
    pattern: /\b(Yahoo|yahoo_delayed|delayed feed|mock fallback|fake chart|backup structure)\b/i,
    guidance:
      "Provider plumbing and mock/fallback language should not leak into production copy.",
  },
  {
    desk: "Language",
    severity: "polish",
    pattern: /\b(nonsense|lol|AI-written|secret sauce|weird|fake levels)\b/i,
    guidance:
      "Replace casual/internal language with polished product language.",
  },
  {
    desk: "Calibration",
    severity: "ship-gate",
    pattern: /\b(sector_rate|sector default|unconfirmed ticker|needs_review)\b/i,
    guidance:
      "Launch stock maps should use only high-confidence ticker-specific calibration.",
  },
  {
    desk: "Release QA",
    severity: "ship-gate",
    pattern: /\b(TODO|FIXME|console\.log|debugger)\b/,
    guidance:
      "Debug markers must be resolved before production deploy.",
  },
];

const findings = [];

for (const file of textFiles) {
  const filePath = relative(root, file).replace(/\\/g, "/");
  const userFacingPath = /^(app|components|content)\//.test(filePath) && !/^app\/api\//.test(filePath);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const internalLine =
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.includes("new RegExp(");
    for (const scan of scans) {
      if (scan.desk !== "Release QA" && internalLine) continue;
      if ((scan.desk === "Data Trust" || scan.desk === "Language") && !userFacingPath) continue;
      if (
        scan.desk === "Calibration" &&
        (!userFacingPath || /^(export type|type |interface |status:)/.test(trimmed))
      ) {
        continue;
      }
      if (scan.pattern.test(line)) {
        findings.push({
          desk: scan.desk,
          severity: scan.severity,
          file: filePath,
          line: index + 1,
          excerpt: line.trim().slice(0, 180),
          guidance: scan.guidance,
        });
      }
    }
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  filesScanned: textFiles.length,
  findings,
  counts: findings.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.severity] = (acc[item.severity] ?? 0) + 1;
      return acc;
    },
    { total: 0 },
  ),
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(summary, null, 2));

console.log(`Agent desk audit scanned ${summary.filesScanned} files.`);
console.log(`Findings: ${summary.counts.total}`);
console.log(`Report: ${relative(root, outputPath)}`);

if (summary.filesScanned === 0) {
  throw new Error("Agent desk audit scanned zero files. Release audit is invalid.");
}

function listFiles(paths) {
  const files = [];
  for (const path of paths) {
    let tracked = [];
    try {
      const output = execFileSync("git", ["ls-files", path], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      tracked = output
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => join(root, item));
    } catch {
      tracked = [];
    }

    files.push(...(tracked.length > 0 ? tracked : walk(join(root, path))));
  }
  return [...new Set(files)];
}

function walk(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];

  const files = [];
  for (const entry of readdirSync(path)) {
    if ([".git", ".next", "node_modules", "playwright-report", "test-results"].includes(entry)) {
      continue;
    }
    files.push(...walk(join(path, entry)));
  }
  return files;
}
