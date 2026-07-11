import { NextResponse } from "next/server";

import { accessSummary } from "@/lib/access-mode";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    ...accessSummary(),
  });
}
