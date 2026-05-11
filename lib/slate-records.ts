import { promises as fs } from "node:fs";
import path from "node:path";

export interface SlateVerdictRecord {
  id: string;
  type: "render" | "acknowledged";
  timestamp: string;
  userId: string;
  verdictState: string;
  spyState: string;
  spxState: string;
  ruleVersion: string;
  sessionDate: string;
}

export interface SlateComplianceAck {
  id: string;
  timestamp: string;
  userId: string;
  termsVersion: string;
}

const ROOT =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "spyprophet")
    : path.join(process.cwd(), ".data");

const VERDICTS = path.join(ROOT, "slate-verdicts.jsonl");
const ACKS = path.join(ROOT, "slate-compliance-acks.jsonl");

export async function appendSlateVerdict(record: SlateVerdictRecord) {
  await appendJsonl(VERDICTS, record);
}

export async function readSlateVerdicts(userId: string): Promise<SlateVerdictRecord[]> {
  const rows = await readJsonl<SlateVerdictRecord>(VERDICTS);
  return rows
    .filter((row) => row.userId === userId)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 50);
}

export async function appendComplianceAck(record: SlateComplianceAck) {
  await appendJsonl(ACKS, record);
}

export async function readComplianceAcks(userId: string): Promise<SlateComplianceAck[]> {
  const rows = await readJsonl<SlateComplianceAck>(ACKS);
  return rows
    .filter((row) => row.userId === userId)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

async function appendJsonl(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonl<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}
