import { NextResponse } from "next/server";

import { toPublicStockSnapshot } from "@/lib/stocks/public";
import { buildYahooStockEngineSnapshot } from "@/lib/stocks/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") ?? "AAPL").trim().toUpperCase();
  const overrideHigh = url.searchParams.get("overrideHigh");
  const overrideTimestamp = url.searchParams.get("overrideTimestamp");
  const date = url.searchParams.get("date");
  const override =
    overrideHigh && overrideTimestamp
      ? {
          primaryHigh: Number(overrideHigh),
          primaryTimestamp: overrideTimestamp,
        }
      : null;

  if (!/^[A-Z.]{1,8}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400 });
  }
  if (
    override &&
    (!Number.isFinite(override.primaryHigh) ||
      override.primaryHigh <= 0 ||
      !Number.isFinite(Date.parse(override.primaryTimestamp)))
  ) {
    return NextResponse.json({ error: "Invalid manual anchor override." }, { status: 400 });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid replay date." }, { status: 400 });
  }

  try {
    const snapshot = await buildYahooStockEngineSnapshot(ticker, override, date);
    return NextResponse.json(toPublicStockSnapshot(snapshot), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Stocks snapshot failed", error);
    return NextResponse.json(
      { error: "Stocks snapshot could not be built." },
      { status: 503 },
    );
  }
}
