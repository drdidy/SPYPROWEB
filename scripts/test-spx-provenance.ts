// Pure-function tests for lib/spx-provenance.ts. The component
// surface (badge, debug overlay) is exercised at runtime; these
// assertions cover the deterministic helpers that decide which
// trust tier the displayed SPX value sits in.
//
// Run: `npx tsx scripts/test-spx-provenance.ts`.

import {
  __test,
  STALE_BASIS_MS,
  deriveProvenance,
  isCashMarketOpenNow,
  provenanceDetail,
  provenanceLabel,
} from "../lib/spx-provenance";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Reference: Tue May 12 2026 10:00 CT (RTH open) and the SAME-WEEK
// Sat May 16 15:00 CT (closed). The Saturday must sit AFTER the
// Tuesday so a "now=Saturday" + "captured=Tuesday" pair produces a
// positive (large, stale) basis age.
const RTH_NOON_CT = new Date("2026-05-12T15:00:00Z"); // 10:00 CT (CDT-5)
const SAT_AFTERNOON_CT = new Date("2026-05-16T20:00:00Z"); // Sat 15:00 CT

function makeMeta(over: Partial<import("../lib/types").SPXSnapshotMeta> = {}) {
  return {
    fetcher: "yfinance",
    barsSource: "yfinance",
    quoteSource: "yfinance",
    barsError: null,
    quoteError: null,
    barsCount: 36,
    lookbackHours: 36,
    appliedOffset: 28.5,
    computedOffset: 28.5,
    offsetSource: "computed" as const,
    spxSpot: 5_872.0,
    esSpot: 5_843.5,
    quoteCapturedAt: RTH_NOON_CT.toISOString(),
    asOf: RTH_NOON_CT.toISOString(),
    ...over,
  };
}

// --- isCashMarketOpenNow ---
check("RTH 10:00 CT Monday → open", isCashMarketOpenNow(RTH_NOON_CT));
check(
  "Saturday 15:00 CT → closed",
  !isCashMarketOpenNow(SAT_AFTERNOON_CT),
);
check(
  "before 08:30 CT → closed",
  !isCashMarketOpenNow(new Date("2026-05-12T13:00:00Z")), // 08:00 CT
);
check(
  "after 15:00 CT → closed",
  !isCashMarketOpenNow(new Date("2026-05-12T22:00:00Z")), // 17:00 CT
);

// --- deriveProvenance: tier classification ---
{
  const p = deriveProvenance(makeMeta(), RTH_NOON_CT);
  check("RTH + fresh basis → live", p?.trust === "live", `got ${p?.trust}`);
  check(
    "computed SPX = ES + offset",
    p?.computedSpx === 5_843.5 + 28.5,
    `got ${p?.computedSpx}`,
  );
  check("not overridden when offsetSource=computed", p?.isOverridden === false);
}
{
  // Cash closed (Saturday) and basis fresh — synthetic because
  // the cash market isn't printing.
  const freshOnSat = new Date(
    SAT_AFTERNOON_CT.getTime() - 10_000,
  ).toISOString();
  const p = deriveProvenance(
    makeMeta({ quoteCapturedAt: freshOnSat }),
    SAT_AFTERNOON_CT,
  );
  check(
    "cash closed + fresh basis → synthetic",
    p?.trust === "synthetic",
    `got ${p?.trust}`,
  );
}
{
  // Stale basis during RTH.
  const oldCapture = new Date(RTH_NOON_CT.getTime() - 5 * 60_000).toISOString();
  const p = deriveProvenance(
    makeMeta({ quoteCapturedAt: oldCapture }),
    RTH_NOON_CT,
  );
  check(
    "RTH + basis > 60s old → stale",
    p?.trust === "stale",
    `got ${p?.trust}`,
  );
  check(
    "stale wins over synthetic when both apply",
    deriveProvenance(
      makeMeta({ quoteCapturedAt: oldCapture }),
      SAT_AFTERNOON_CT,
    )?.trust === "stale",
  );
}
{
  // Boundary: exactly 60s old → not yet stale (>, not >=).
  const exact = new Date(RTH_NOON_CT.getTime() - STALE_BASIS_MS).toISOString();
  const p = deriveProvenance(
    makeMeta({ quoteCapturedAt: exact }),
    RTH_NOON_CT,
  );
  check(
    "basis exactly 60s old → still live (boundary)",
    p?.trust === "live",
    `got ${p?.trust}`,
  );
}
{
  // Env override flag flows through.
  const p = deriveProvenance(
    makeMeta({ offsetSource: "env_override" }),
    RTH_NOON_CT,
  );
  check("env_override propagates to isOverridden", p?.isOverridden === true);
  check(
    "provenanceDetail mentions broker spread when overridden",
    provenanceDetail(p!).includes("broker-spread override"),
  );
}
check("null meta → null provenance", deriveProvenance(null) === null);
check("undefined meta → null provenance", deriveProvenance(undefined) === null);

// --- copy helpers ---
{
  const live = deriveProvenance(makeMeta(), RTH_NOON_CT)!;
  const synth = deriveProvenance(
    makeMeta({
      quoteCapturedAt: new Date(SAT_AFTERNOON_CT.getTime() - 10_000).toISOString(),
    }),
    SAT_AFTERNOON_CT,
  )!;
  check("live label = 'Live'", provenanceLabel(live) === "Live");
  check(
    "synthetic label calls out ES + basis derivation",
    provenanceLabel(synth).toLowerCase().includes("synthetic") &&
      provenanceLabel(synth).toLowerCase().includes("es") &&
      provenanceLabel(synth).toLowerCase().includes("basis"),
  );
  check(
    "detail string includes the basis value",
    provenanceDetail(live).includes("28.50"),
  );
  check(
    "detail string includes the ES spot",
    provenanceDetail(live).includes("5843.50"),
  );
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll spx-provenance cases passed.`);
