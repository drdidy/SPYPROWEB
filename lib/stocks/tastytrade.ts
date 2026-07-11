import WebSocket from "ws";

export type TastytradeEquityQuote = {
  symbol: string;
  price: number;
  capturedAt: string;
  source: "dxlink" | "rest";
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

type QuoteTokenCache = {
  token: string;
  dxlinkUrl: string;
  expiresAt: number;
};

const TASTYTRADE_API_VERSION = "20251101";
const TOKEN_REFRESH_SAFETY_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 15 * 60_000;
const QUOTE_TOKEN_TTL_MS = 23 * 60 * 60_000;
const OAUTH_TIMEOUT_MS = 6_000;
const QUOTE_TIMEOUT_MS = 4_000;
const DXLINK_TIMEOUT_MS = 4_500;
const DXLINK_CHANNEL = 3;
const QUOTE_CACHE_TTL_MS = 2_000;

let tokenCache: TokenCache | null = null;
let quoteTokenCache: QuoteTokenCache | null = null;
const quoteCache = new Map<
  string,
  { expiresAt: number; quote: TastytradeEquityQuote }
>();

export async function fetchTastytradeEquityQuote(
  symbol: string,
): Promise<TastytradeEquityQuote | null> {
  const clean = symbol.trim().toUpperCase();
  if (!/^[A-Z.]{1,8}$/.test(clean) || !hasTastytradeQuoteConfig()) {
    return null;
  }

  try {
    const cached = quoteCache.get(clean);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.quote;
    }

    const quote =
      (await fetchDxLinkEquityQuote(clean)) ??
      (await fetchRestEquityQuote(clean));
    if (!quote) return null;
    quoteCache.set(clean, {
      quote,
      expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
    });
    return quote;
  } catch {
    return null;
  }
}

export function hasTastytradeQuoteConfig(): boolean {
  return Boolean(
    process.env.TASTYTRADE_CLIENT_ID &&
      process.env.TASTYTRADE_CLIENT_SECRET &&
      process.env.TASTYTRADE_REFRESH_TOKEN,
  );
}

export function extractTastytradeEquityPrice(
  body: unknown,
  symbol: string,
): number | null {
  const clean = symbol.trim().toUpperCase();
  for (const item of quoteItems(body)) {
    const itemSymbol = (
      stringValue(item.symbol) ||
      stringValue(item["streamer-symbol"]) ||
      stringValue(item.streamerSymbol)
    ).toUpperCase();
    if (itemSymbol !== clean) continue;
    return quoteLast(item);
  }
  return null;
}

async function getAccessToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.TASTYTRADE_CLIENT_ID;
  const clientSecret = process.env.TASTYTRADE_CLIENT_SECRET;
  const refreshToken = process.env.TASTYTRADE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const body = await fetchJson(`${tastytradeBaseUrl()}/oauth/token`, {
    method: "POST",
    body: params,
    headers: {
      Accept: "application/json",
      "Accept-Version": TASTYTRADE_API_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeoutMs: OAUTH_TIMEOUT_MS,
  });

  const tokenBody = isRecord(body) && isRecord(body.data) ? body.data : body;
  const accessToken =
    readString(tokenBody, "access_token") ??
    readString(tokenBody, "access-token") ??
    readString(tokenBody, "accessToken");
  if (!accessToken) {
    tokenCache = null;
    return null;
  }

  const expiresInSeconds =
    readNumber(tokenBody, "expires_in") ??
    readNumber(tokenBody, "expires-in") ??
    readNumber(tokenBody, "expiresIn") ??
    DEFAULT_TOKEN_TTL_MS / 1000;
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000 - TOKEN_REFRESH_SAFETY_MS,
  };
  return accessToken;
}

async function getQuoteToken(): Promise<QuoteTokenCache | null> {
  if (quoteTokenCache && quoteTokenCache.expiresAt > Date.now()) {
    return quoteTokenCache;
  }

  const token = await getAccessToken();
  if (!token) return null;

  const body = await fetchJson(`${tastytradeBaseUrl()}/api-quote-tokens`, {
    method: "GET",
    headers: authHeaders(token),
    timeoutMs: OAUTH_TIMEOUT_MS,
  });
  const data = isRecord(body) && isRecord(body.data) ? body.data : body;
  const quoteToken =
    readString(data, "token") ??
    readString(data, "api-quote-token") ??
    readString(data, "apiQuoteToken");
  const dxlinkUrl =
    readString(data, "dxlink-url") ??
    readString(data, "dxlinkUrl") ??
    readString(data, "streamer-url") ??
    readString(data, "streamerUrl");
  if (!quoteToken || !dxlinkUrl) {
    quoteTokenCache = null;
    return null;
  }

  quoteTokenCache = {
    token: quoteToken,
    dxlinkUrl,
    expiresAt: Date.now() + QUOTE_TOKEN_TTL_MS,
  };
  return quoteTokenCache;
}

async function fetchDxLinkEquityQuote(
  symbol: string,
): Promise<TastytradeEquityQuote | null> {
  const quoteToken = await getQuoteToken();
  if (!quoteToken) return null;
  return collectDxLinkEquityQuote(quoteToken, symbol).catch(() => null);
}

function collectDxLinkEquityQuote(
  quoteToken: QuoteTokenCache,
  symbol: string,
): Promise<TastytradeEquityQuote | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let authorized = false;
    let channelRequested = false;
    let feedConfigured = false;
    const capturedAt = new Date().toISOString();
    const ws = new WebSocket(quoteToken.dxlinkUrl);
    const timeout = setTimeout(() => finish(null), DXLINK_TIMEOUT_MS);

    const finish = (quote: TastytradeEquityQuote | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // Best effort cleanup only.
      }
      resolve(quote);
    };

    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    const authorize = () => {
      if (authorized) return;
      send({ type: "AUTH", channel: 0, token: quoteToken.token });
    };

    const openFeedChannel = () => {
      if (channelRequested) return;
      channelRequested = true;
      send({
        type: "CHANNEL_REQUEST",
        channel: DXLINK_CHANNEL,
        service: "FEED",
        parameters: { contract: "AUTO" },
      });
    };

    const setupFeed = () => {
      if (feedConfigured) return;
      feedConfigured = true;
      send({
        type: "FEED_SETUP",
        channel: DXLINK_CHANNEL,
        acceptAggregationPeriod: 0.1,
        acceptDataFormat: "COMPACT",
        acceptEventFields: {
          Trade: ["eventType", "eventSymbol", "price", "dayVolume", "size"],
          Quote: ["eventType", "eventSymbol", "bidPrice", "askPrice", "bidSize", "askSize"],
        },
      });
    };

    const subscribe = () => {
      send({
        type: "FEED_SUBSCRIPTION",
        channel: DXLINK_CHANNEL,
        reset: true,
        add: [
          { type: "Trade", symbol },
          { type: "Quote", symbol },
        ],
      });
    };

    ws.on("open", () => {
      send({
        type: "SETUP",
        channel: 0,
        version: "0.1-DXF-JS/0.3.0",
        keepaliveTimeout: 60,
        acceptKeepaliveTimeout: 60,
      });
    });

    ws.on("message", (data) => {
      const message = parseWsMessage(data);
      if (!message || !isRecord(message)) return;

      const streamQuote = extractDxLinkEquityPrice(message, symbol);
      if (streamQuote !== null) {
        finish({
          symbol,
          price: streamQuote,
          capturedAt,
          source: "dxlink",
        });
        return;
      }

      const type = stringValue(message.type);
      if (type === "SETUP") {
        authorize();
        return;
      }
      if (type === "AUTH_STATE") {
        const state = stringValue(message.state);
        if (state === "UNAUTHORIZED") {
          authorize();
          return;
        }
        if (state === "AUTHORIZED") {
          authorized = true;
          openFeedChannel();
          return;
        }
      }
      if (type === "CHANNEL_OPENED" && readNumber(message, "channel") === DXLINK_CHANNEL) {
        setupFeed();
        return;
      }
      if (type === "FEED_CONFIG" && readNumber(message, "channel") === DXLINK_CHANNEL) {
        subscribe();
      }
    });

    ws.on("error", () => finish(null));
    ws.on("close", () => finish(null));
  });
}

async function fetchRestEquityQuote(
  symbol: string,
): Promise<TastytradeEquityQuote | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const urls = [
    byTypeUrl("equity", symbol),
    byTypeUrl("equities", symbol),
  ];
  for (const url of urls) {
    try {
      const body = await fetchJson(url, {
        headers: authHeaders(token),
        timeoutMs: QUOTE_TIMEOUT_MS,
      });
      const price = extractTastytradeEquityPrice(body, symbol);
      if (price !== null) {
        return {
          symbol,
          price,
          capturedAt: new Date().toISOString(),
          source: "rest",
        };
      }
    } catch {
      // Try the next supported query shape before giving up.
    }
  }
  return null;
}

function byTypeUrl(param: string, symbol: string): string {
  const url = new URL(`${tastytradeBaseUrl()}/market-data/by-type`);
  url.searchParams.set(param, symbol);
  return url.toString();
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
      throw new Error(`Tastytrade request failed with HTTP ${res.status}.`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Accept-Version": TASTYTRADE_API_VERSION,
    Authorization: `Bearer ${token}`,
  };
}

function tastytradeBaseUrl(): string {
  return process.env.TASTYTRADE_ENV === "certification"
    ? "https://api.cert.tastytrade.com"
    : "https://api.tastytrade.com";
}

function quoteItems(body: unknown): Array<Record<string, unknown>> {
  if (!isRecord(body)) return [];
  const data = body.data;
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (!isRecord(data)) return [];
  if (Array.isArray(data.items)) {
    return data.items.filter(isRecord);
  }
  if (typeof data.symbol === "string") {
    return [data];
  }
  return [];
}

function quoteLast(item: Record<string, unknown>): number | null {
  const direct =
    readNumber(item, "last") ??
    readNumber(item, "last-price") ??
    readNumber(item, "lastPrice") ??
    readNumber(item, "mark") ??
    readNumber(item, "mark-price") ??
    readNumber(item, "markPrice") ??
    readNumber(item, "close") ??
    readNumber(item, "close-price") ??
    readNumber(item, "closePrice");
  if (direct !== null && direct > 0) return direct;

  const bid = readNumber(item, "bid") ?? readNumber(item, "bid-price") ?? readNumber(item, "bidPrice");
  const ask = readNumber(item, "ask") ?? readNumber(item, "ask-price") ?? readNumber(item, "askPrice");
  if (bid !== null && ask !== null && bid > 0 && ask >= bid) {
    return (bid + ask) / 2;
  }
  return null;
}

function extractDxLinkEquityPrice(
  message: Record<string, unknown>,
  symbol: string,
): number | null {
  const direct = extractDxLinkRecordPrice(message, symbol);
  if (direct !== null) return direct;
  return extractDxLinkDataPrice(message.data, symbol);
}

function extractDxLinkRecordPrice(
  item: Record<string, unknown>,
  symbol: string,
): number | null {
  const itemSymbol = (
    stringValue(item.eventSymbol) ||
    stringValue(item["event-symbol"]) ||
    stringValue(item.symbol)
  ).toUpperCase();
  if (itemSymbol && itemSymbol !== symbol) return null;

  const trade =
    readNumber(item, "price") ??
    readNumber(item, "last") ??
    readNumber(item, "last-price") ??
    readNumber(item, "lastPrice");
  if (trade !== null && trade > 0) return trade;

  const bid =
    readNumber(item, "bidPrice") ??
    readNumber(item, "bid-price") ??
    readNumber(item, "bid");
  const ask =
    readNumber(item, "askPrice") ??
    readNumber(item, "ask-price") ??
    readNumber(item, "ask");
  if (bid !== null && ask !== null && bid > 0 && ask >= bid) {
    return roundQuotePrice((bid + ask) / 2);
  }
  return null;
}

function extractDxLinkDataPrice(data: unknown, symbol: string): number | null {
  if (Array.isArray(data)) {
    for (let index = 0; index < data.length; index += 1) {
      const group = stringValue(data[index]);
      const payload = data[index + 1];
      if (Array.isArray(payload)) {
        const compact = extractCompactPayloadPrice(group, payload, symbol);
        if (compact !== null) return compact;
      }
      const nested = extractDxLinkDataPrice(data[index], symbol);
      if (nested !== null) return nested;
    }
    return null;
  }

  if (isRecord(data)) {
    const recordPrice = extractDxLinkRecordPrice(data, symbol);
    if (recordPrice !== null) return recordPrice;
    for (const value of Object.values(data)) {
      const nested = extractDxLinkDataPrice(value, symbol);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function extractCompactPayloadPrice(
  group: string,
  payload: unknown[],
  symbol: string,
): number | null {
  for (let index = 0; index < payload.length; index += 1) {
    const type = stringValue(payload[index]) || group;
    if (type === "Trade" || type === "TradeETH") {
      const eventSymbol = stringValue(payload[index + 1]).toUpperCase();
      const price = numericValue(payload[index + 2]);
      if (eventSymbol === symbol && price !== null && price > 0) {
        return price;
      }
      index += 4;
      continue;
    }
    if (type === "Quote") {
      const eventSymbol = stringValue(payload[index + 1]).toUpperCase();
      const bid = numericValue(payload[index + 2]);
      const ask = numericValue(payload[index + 3]);
      if (eventSymbol === symbol && bid !== null && ask !== null && bid > 0 && ask >= bid) {
        return roundQuotePrice((bid + ask) / 2);
      }
      index += 5;
    }
  }
  return null;
}

function parseWsMessage(data: WebSocket.RawData): unknown {
  try {
    const text = Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : data.toString("utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function numericValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function roundQuotePrice(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function readString(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const raw = value[key];
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
