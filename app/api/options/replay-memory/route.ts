import { NextResponse } from "next/server";

import { loadOptionReplayMemory } from "@/lib/options/memory-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const snapshot = await loadOptionReplayMemory();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
