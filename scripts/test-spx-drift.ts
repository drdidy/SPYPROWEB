// Drift check for the synthetic SPX value.
//
// Contract:
//   During RTH (M-F 08:30–15:00 CT), the displayed SPX value
//   (computed = ES + appliedOffset) must be within ±2 points of
//   the cash SPX (^GSPC) print at the same instant. Larger drift
//   means the basis is stale or the env override is wrong.
//
// This script makes two HTTP calls:
//   1. SPX_API_BASE/api/spx/snapshot                 → our snapshot
//   2. https://query1.finance.yahoo.com/v7/finance/quote?symbols=^GSPC
//                                                    → cash spot
//
// If SPX_API_BASE is unset or unreachable, the test exits with a
// non-failure "skipped" message — so it can sit safely in the same
// `for s in scripts/test-*.ts` loop the other scripts use, without
// turning local dev into a network-dependent run.
//
// Run: `SPX_API_BASE=https://www.spyprophet.app npx tsx scripts/test-spx-drift.ts`
//
// Skip-with-zero-exit conditions:
//   - SPX_API_BASE unset
//   - either fetch fails
//   - cash market is currently closed (drift only meaningful during RTH)

const TOLERANCE_PTS = 2.0;

function logSkip(reason: string) {
  console.log(`⊘  SPX drift check skipped — ${reason}`);
  process.exit(0);
}

function logPass(label: string) {
  console.log(`✓  ${label}`);
}

function logFail(label: string, detail?: string) {
  console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
  process.exit(1);
}

function isCashMarketOpenNow(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes =
    parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
  return minutes >= 510 && minutes < 900;
}

async function main() {
  const base = process.env.SPX_API_BASE;
  if (!base) {
    logSkip("set SPX_API_BASE to run (e.g. https://www.spyprophet.app)");
  }
  if (!isCashMarketOpenNow()) {
    logSkip("cash market closed; drift check only meaningful during RTH");
  }

  // 1. Our snapshot.
  let snap: {
    price?: { last?: number };
    _meta?: {
      esSpot?: number;
      spxSpot?: number;
      appliedOffset?: number;
      quoteCapturedAt?: string;
      offsetSource?: string;
    };
  };
  try {
    const res = await fetch(`${base}/api/spx/snapshot`, { cache: "no-store" });
    if (!res.ok) logSkip(`our snapshot returned ${res.status}`);
    snap = await res.json();
  } catch (e) {
    logSkip(`fetch failed: ${e instanceof Error ? e.message : "unknown"}`);
    return;
  }

  const displayed = snap.price?.last;
  const meta = snap._meta;
  if (typeof displayed !== "number" || !meta) {
    logSkip("snapshot missing price.last or _meta");
  }

  // 2. Cash SPX.
  let cashSpx: number;
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC",
      {
        cache: "no-store",
        headers: {
          // yfinance's public endpoint sometimes 403s without a UA.
          "User-Agent": "spyprophet-drift-check/1.0",
        },
      },
    );
    if (!res.ok) logSkip(`yahoo returned ${res.status}`);
    const json: {
      quoteResponse?: { result?: Array<{ regularMarketPrice?: number }> };
    } = await res.json();
    const price = json.quoteResponse?.result?.[0]?.regularMarketPrice;
    if (typeof price !== "number") logSkip("yahoo response missing price");
    cashSpx = price as number;
  } catch (e) {
    logSkip(`yahoo fetch failed: ${e instanceof Error ? e.message : "unknown"}`);
    return;
  }

  const drift = (displayed as number) - cashSpx;
  const absDrift = Math.abs(drift);

  console.log(`displayed SPX (synthetic): ${(displayed as number).toFixed(2)}`);
  console.log(`cash SPX (^GSPC):          ${cashSpx.toFixed(2)}`);
  console.log(`drift:                     ${drift >= 0 ? "+" : ""}${drift.toFixed(2)} pts`);
  console.log(`basis source:              ${meta?.offsetSource ?? "unknown"}`);
  console.log(`basis captured at:         ${meta?.quoteCapturedAt ?? "unknown"}`);
  console.log(`basis age:                 ${
    meta?.quoteCapturedAt
      ? Math.round((Date.now() - Date.parse(meta.quoteCapturedAt)) / 1000) +
        "s"
      : "unknown"
  }`);

  if (absDrift <= TOLERANCE_PTS) {
    logPass(
      `displayed SPX within ±${TOLERANCE_PTS}pt of cash (drift ${drift.toFixed(2)})`,
    );
    process.exit(0);
  } else {
    logFail(
      `displayed SPX drift ${drift.toFixed(2)}pt exceeds ±${TOLERANCE_PTS}pt tolerance`,
      `basis may be stale or env override wrong (offsetSource=${meta?.offsetSource})`,
    );
  }
}

main().catch((e) => {
  console.log(`✗  unexpected error: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
