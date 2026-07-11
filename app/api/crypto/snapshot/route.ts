import { NextResponse } from "next/server";

import { buildCoinbaseCryptoSnapshot } from "@/lib/crypto/coinbase";
import { toPublicCryptoSnapshot } from "@/lib/crypto/public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asset = (url.searchParams.get("asset") ?? "BTC").trim().toUpperCase();
  const date = url.searchParams.get("date");

  if (!/^[A-Z]{2,5}$/.test(asset)) {
    return NextResponse.json({ error: "Invalid crypto asset." }, { status: 400 });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid replay date." }, { status: 400 });
  }

  try {
    const snapshot = await buildCoinbaseCryptoSnapshot(asset, date);
    return NextResponse.json(toPublicCryptoSnapshot(snapshot), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Crypto snapshot failed", error);
    return NextResponse.json(
      { error: "Crypto snapshot could not be built." },
      { status: 503 },
    );
  }
}
