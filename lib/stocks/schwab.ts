export type SchwabEquityQuote = {
  symbol: string;
  price: number;
  capturedAt: string;
  source: "schwab";
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

const SCHWAB_AUTH_BASE = "https://api.schwabapi.com";
const SCHWAB_MARKET_DATA_BASE = "https://api.schwabapi.com/marketdata/v1";
const TOKEN_REFRESH_SAFETY_MS = 60_000;
const DEFAULT_ACCESS_TOKEN_TTL_MS = 30 * 60_000;
const TOKEN_TIMEOUT_MS = 6_000;
const QUOTE_TIMEOUT_MS = 4_000;
const QUOTE_CACHE_TTL_MS = 2_000;

let tokenCache: TokenCache | null = null;
const quoteCache = new Map<string, { expiresAt: number; quote: SchwabEquityQuote }>();

export async function fetchSchwabEquityQuote(
  symbol: string,
): Promise<SchwabEquityQuote | null> {
  const clean = symbol.trim().toUpperCase();
  if (!/^[A-Z.]{1,8}$/.test(clean) || !hasSchwabQuoteConfig()) return null;

  try {
    const cached = quoteCache.get(clean);
    if (cached && cached.expiresAt > Date.now()) return cached.quote;

    const token = await getAccessToken();
    if (!token) return null;

    const url = new URL(`${SCHWAB_MARKET_DATA_BASE}/quotes`);
    url.searchParams.set("symbols", clean);
    url.searchParams.set("fields", "quote");

    const body = await fetchJson(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      timeoutMs: QUOTE_TIMEOUT_MS,
    });
    const price = extractSchwabEquityPrice(body, clean);
    if (price === null) return null;

    const quote = {
      symbol: clean,
      price,
      capturedAt: new Date().toISOString(),
      source: "schwab" as const,
    };
    quoteCache.set(clean, {
      quote,
      expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
    });
    return quote;
  } catch {
    return null;
  }
}

export function hasSchwabQuoteConfig(): boolean {
  return Boolean(
    schwabEnv("SCHWAB_CLIENT_ID", "SCHWAB_APP_KEY") &&
      schwabEnv("SCHWAB_CLIENT_SECRET", "SCHWAB_APP_SECRET") &&
      schwabEnv("SCHWAB_REFRESH_TOKEN"),
  );
}

export function extractSchwabEquityPrice(body: unknown, symbol: string): number | null {
  const clean = symbol.trim().toUpperCase();
  if (!isRecord(body)) return null;

  const direct = body[clean] ?? body[clean.replace(".", "/")];
  const candidates = [
    direct,
    ...Object.values(body).filter(isRecord).filter((item) => {
      const reference = isRecord(item.reference) ? item.reference : {};
      const quote = isRecord(item.quote) ? item.quote : {};
      const itemSymbol =
        stringValue(item.symbol) ||
        stringValue(item.key) ||
        stringValue(reference.symbol) ||
        stringValue(quote.symbol);
      return itemSymbol.toUpperCase() === clean;
    }),
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const quote = isRecord(candidate.quote) ? candidate.quote : candidate;
    const regular = isRecord(candidate.regular) ? candidate.regular : {};
    const extended = isRecord(candidate.extended) ? candidate.extended : {};
    const price =
      readNumber(quote, "lastPrice") ??
      readNumber(quote, "last") ??
      readNumber(quote, "mark") ??
      readNumber(quote, "markPrice") ??
      readNumber(quote, "regularMarketLastPrice") ??
      readNumber(regular, "regularMarketLastPrice") ??
      readNumber(extended, "lastPrice") ??
      midpoint(
        readNumber(quote, "bidPrice") ?? readNumber(quote, "bid"),
        readNumber(quote, "askPrice") ?? readNumber(quote, "ask"),
      ) ??
      readNumber(quote, "closePrice") ??
      readNumber(regular, "closePrice");
    if (price !== null && price > 0) return price;
  }

  return null;
}

async function getAccessToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  const clientId = schwabEnv("SCHWAB_CLIENT_ID", "SCHWAB_APP_KEY");
  const clientSecret = schwabEnv("SCHWAB_CLIENT_SECRET", "SCHWAB_APP_SECRET");
  const refreshToken = schwabEnv("SCHWAB_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const payload = await fetchJson(`${SCHWAB_AUTH_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    timeoutMs: TOKEN_TIMEOUT_MS,
  });
  if (!isRecord(payload)) return null;

  const accessToken =
    stringValue(payload.access_token) ||
    stringValue(payload.accessToken) ||
    stringValue(payload["access-token"]);
  if (!accessToken) {
    tokenCache = null;
    return null;
  }

  const expiresInSeconds =
    readNumber(payload, "expires_in") ??
    readNumber(payload, "expiresIn") ??
    readNumber(payload, "expires-in") ??
    DEFAULT_ACCESS_TOKEN_TTL_MS / 1000;
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000 - TOKEN_REFRESH_SAFETY_MS,
  };
  return accessToken;
}

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<unknown> {
  const { timeoutMs, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...requestInit,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Schwab request failed with HTTP ${res.status}.`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function midpoint(bid: number | null, ask: number | null): number | null {
  if (bid === null || ask === null || bid <= 0 || ask <= 0) return null;
  return Math.round(((bid + ask) / 2) * 10_000) / 10_000;
}

function readNumber(item: Record<string, unknown>, key: string): number | null {
  const value = item[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function schwabEnv(primary: string, fallback?: string): string {
  return cleanSchwabEnv(process.env[primary], primary) || cleanSchwabEnv(fallback ? process.env[fallback] : undefined, fallback);
}

function cleanSchwabEnv(value: string | undefined, key?: string): string {
  let clean = (value ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
  const prefixes = [
    key,
    "SCHWAB_CLIENT_ID",
    "SCHWAB_CLIENT_SECRET",
    "SCHWAB_APP_KEY",
    "SCHWAB_APP_SECRET",
    "SCHWAB_REFRESH_TOKEN",
  ].filter(Boolean) as string[];
  for (const prefix of prefixes) {
    const marker = `${prefix}=`;
    if (clean.startsWith(marker)) {
      clean = clean.slice(marker.length).trim().replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return clean;
}
