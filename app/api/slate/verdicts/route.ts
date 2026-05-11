import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendSlateVerdict,
  readSlateVerdicts,
  type SlateVerdictRecord,
} from "@/lib/slate-records";

export const dynamic = "force-dynamic";

const VerdictBody = z.object({
  type: z.enum(["render", "acknowledged"]),
  userId: z.string().min(1).max(120),
  verdictState: z.string().min(1).max(80),
  spyState: z.string().min(1).max(80),
  spxState: z.string().min(1).max(80),
  ruleVersion: z.string().min(1).max(32),
  sessionDate: z.string().min(1).max(40),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || "anonymous";
  const records = await readSlateVerdicts(userId);
  return NextResponse.json({ records });
}

export async function POST(req: Request) {
  const parsed = VerdictBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verdict record" }, { status: 400 });
  }
  const record: SlateVerdictRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...parsed.data,
  };
  await appendSlateVerdict(record);
  return NextResponse.json({ ok: true, record });
}
