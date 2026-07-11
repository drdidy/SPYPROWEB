import { NextResponse } from "next/server";

import { getStockIdentity } from "@/lib/stocks/logos";

export const runtime = "nodejs";

const LOGO_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase();
  const identity = getStockIdentity(ticker);

  if (!ticker || !/^[A-Z.]{1,8}$/.test(ticker)) {
    return new NextResponse(fallbackSvg("STK"), {
      headers: fallbackHeaders(),
    });
  }

  if (!identity.domain) {
    return new NextResponse(fallbackSvg(identity.ticker), {
      headers: fallbackHeaders(),
    });
  }

  const upstreams = [
    `https://logo.clearbit.com/${encodeURIComponent(identity.domain)}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(identity.domain)}&sz=128`,
  ];

  for (const upstream of upstreams) {
    const response = await fetch(upstream, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*",
        "User-Agent": "SPYProphet/1.0",
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(4_000),
    }).catch(() => null);

    if (!response?.ok) continue;
    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) continue;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 128) continue;

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": LOGO_CACHE,
      },
    });
  }

  return new NextResponse(fallbackSvg(identity.ticker), {
    headers: fallbackHeaders(),
  });
}

function fallbackHeaders(): HeadersInit {
  return {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": LOGO_CACHE,
  };
}

function fallbackSvg(ticker: string): string {
  const clean = ticker.slice(0, 4).replace(/[^A-Z.]/g, "");
  const seed = clean.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  const palettes = [
    ["#0A7589", "#B8821F"],
    ["#1E3A5F", "#0D9488"],
    ["#14532D", "#B8821F"],
    ["#4C1D95", "#0A7589"],
    ["#7F1D1D", "#B45309"],
  ];
  const [from, to] = palettes[seed % palettes.length];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${clean}">
  <defs>
    <linearGradient id="g" x1="12" y1="12" x2="116" y2="116" gradientUnits="userSpaceOnUse">
      <stop stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <rect x="8" y="8" width="112" height="112" rx="24" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"/>
  <text x="64" y="74" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${clean.length > 3 ? 27 : 34}" font-weight="800" fill="#FFFDF7" letter-spacing="1">${clean}</text>
</svg>`;
}
