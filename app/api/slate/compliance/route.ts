import { NextResponse } from "next/server";
import { z } from "zod";
import { appendComplianceAck, readComplianceAcks } from "@/lib/slate-records";

export const dynamic = "force-dynamic";

const AckBody = z.object({
  userId: z.string().min(1).max(120),
  termsVersion: z.string().min(1).max(40),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || "anonymous";
  const records = await readComplianceAcks(userId);
  return NextResponse.json({ acknowledged: records.length > 0, records });
}

export async function POST(req: Request) {
  const parsed = AckBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid acknowledgement" }, { status: 400 });
  }
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...parsed.data,
  };
  await appendComplianceAck(record);
  return NextResponse.json({ ok: true, record });
}
