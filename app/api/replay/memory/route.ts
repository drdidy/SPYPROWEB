import { NextResponse } from "next/server";

import { buildReplayMemorySnapshot } from "@/lib/replay-memory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    memory: buildReplayMemorySnapshot(),
  });
}
