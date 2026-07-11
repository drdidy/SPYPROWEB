import { NextResponse } from "next/server";

import { deskRunOrder, prophetDesks } from "@/content/agent-desk";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const configured = new Set(prophetDesks.map((desk) => desk.key));
  const missingFromRunOrder = prophetDesks
    .map((desk) => desk.key)
    .filter((key) => !deskRunOrder.includes(key));
  const unknownRunItems = deskRunOrder.filter((key) => !configured.has(key));
  const launchCritical = prophetDesks.filter((desk) => desk.status === "launch-critical");
  const ready =
    prophetDesks.length === 10 &&
    missingFromRunOrder.length === 0 &&
    unknownRunItems.length === 0 &&
    launchCritical.length >= 1;

  return NextResponse.json({
    ok: ready,
    checkedAt: new Date().toISOString(),
    desks: prophetDesks.map((desk) => ({
      key: desk.key,
      name: desk.name,
      status: desk.status,
      cadence: desk.cadence,
      owner: desk.owner,
      linkedSurface: desk.linkedSurface,
    })),
    runOrder: deskRunOrder,
    checks: [
      {
        label: "Desk registry",
        status: prophetDesks.length === 10 ? "ready" : "degraded",
        detail: `${prophetDesks.length} desks configured.`,
      },
      {
        label: "Run sequence",
        status: missingFromRunOrder.length === 0 && unknownRunItems.length === 0 ? "ready" : "degraded",
        detail:
          missingFromRunOrder.length === 0 && unknownRunItems.length === 0
            ? "Every desk is present in the release run sequence."
            : "Run sequence needs attention.",
      },
      {
        label: "Ship gates",
        status: launchCritical.length >= 1 ? "ready" : "degraded",
        detail: `${launchCritical.length} launch-critical desks are active.`,
      },
    ],
  });
}
