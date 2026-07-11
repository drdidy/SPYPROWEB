import NodeWebSocket from "ws";

import type { ProjectionSide } from "@/lib/contract-projection";

export interface TastytradeOptionCandle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface TastytradeOptionBackfillResult {
  ok: boolean;
  status: "available" | "unavailable" | "not_configured";
  detail: string;
  provider: "tastytrade_dxlink";
  streamerSymbol: string | null;
  orderSymbol: string | null;
  candles: TastytradeOptionCandle[];
  rawMessages: number;
  diagnostic?: {
    connectionOpened: boolean;
    setupSent: boolean;
    authSent: boolean;
    channelRequested: boolean;
    feedConfigured: boolean;
    subscriptionSent: boolean;
    closeCode: number | null;
    closeReason: string | null;
    errorMessage: string | null;
    dxlinkHost: string | null;
    sentMessages: number;
    sendErrors: number;
    sentTypes: string[];
    auth: TastytradeAuthDiagnostic;
  };
}

type TokenCache = {
  accessToken: string;
  baseUrl: string;
  expiresAt: number;
};

type QuoteTokenCache = {
  token: string;
  dxlinkUrl: string;
  authMode: "session" | "oauth";
  expiresAt: number;
};

type SessionCache = {
  sessionToken: string;
  baseUrl: string;
  expiresAt: number;
};

type TastytradeDxLinkDiagnostic = Omit<
  NonNullable<TastytradeOptionBackfillResult["diagnostic"]>,
  "auth"
>;

const TASTYTRADE_API_VERSION = "20251101";
const TOKEN_REFRESH_SAFETY_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 15 * 60_000;
const QUOTE_TOKEN_TTL_MS = 23 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 7_000;
const DXLINK_TIMEOUT_MS = 20_000;
const DXLINK_CHANNEL = 7;

let tokenCache: TokenCache | null = null;
let quoteTokenCache: QuoteTokenCache | null = null;
let sessionCache: SessionCache | null = null;
let authDiagnostic: TastytradeAuthDiagnostic = defaultAuthDiagnostic();

type TastytradeAuthDiagnostic = {
  sessionConfigured: boolean;
  sessionAttempted: boolean;
  sessionCreated: boolean;
  sessionQuoteToken: boolean;
  oauthAttempted: boolean;
  oauthQuoteToken: boolean;
  attempts: Array<{
    stage: "session" | "session_quote" | "oauth_quote";
    host: string;
    status: number | null;
    ok: boolean;
    reason: string;
  }>;
};

type DxRuntimeSocket = {
  readyState: number;
  send(data: string, callback?: (error?: Error) => void): void;
  close(): void;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  addEventListener?: (event: string, listener: (event: any) => void) => void;
};

export function hasTastytradeHistoryConfig(): boolean {
  return Boolean(
    hasTastytradeSessionConfig() ||
      (process.env.TASTYTRADE_CLIENT_ID &&
        process.env.TASTYTRADE_CLIENT_SECRET &&
        process.env.TASTYTRADE_REFRESH_TOKEN),
  );
}

function hasTastytradeSessionConfig(): boolean {
  const login = process.env.TASTYTRADE_LOGIN || process.env.TASTYTRADE_USERNAME;
  return Boolean(
    login &&
      (process.env.TASTYTRADE_REMEMBER_TOKEN ||
        process.env.TASTYTRADE_PASSWORD),
  );
}

export async function fetchTastytradeOptionCandles({
  underlying = "SPX",
  expiration,
  strike,
  side,
  fallbackSymbol = null,
  from,
  to,
  period = "m",
}: {
  underlying?: string;
  expiration: string;
  strike: number;
  side: ProjectionSide;
  fallbackSymbol?: string | null;
  from: Date;
  to: Date;
  period?: "m" | "5m";
}): Promise<TastytradeOptionBackfillResult> {
  authDiagnostic = defaultAuthDiagnostic();
  if (!hasTastytradeHistoryConfig()) {
    return emptyResult("not_configured", "Tastytrade credentials are not configured.", null, null);
  }

  const resolved = await resolveStreamerSymbol({
    underlying,
    expiration,
    strike,
    side,
    fallbackSymbol,
  });
  if (!resolved.streamerSymbol) {
    return emptyResult(
      "unavailable",
      "Tastytrade did not return a matching streamer symbol for this SPXW contract.",
      null,
      resolved.orderSymbol,
    );
  }

  const quoteToken = await getQuoteToken();
  if (!quoteToken) {
    return emptyResult(
      "unavailable",
      "Tastytrade quote authorization did not return a DXLink token.",
      resolved.streamerSymbol,
      resolved.orderSymbol,
    );
  }

  const candles = await collectDxLinkCandles({
    quoteToken,
    streamerSymbol: resolved.streamerSymbol,
    from,
    to,
    period,
  });
  return {
    ok: candles.candles.length > 0,
    status: candles.candles.length > 0 ? "available" : "unavailable",
    detail: candleBackfillDetail(candles),
    provider: "tastytrade_dxlink",
    streamerSymbol: resolved.streamerSymbol,
    orderSymbol: resolved.orderSymbol,
    candles: candles.candles,
    rawMessages: candles.rawMessages,
    diagnostic: {
      ...candles.diagnostic,
      auth: authDiagnostic,
    },
  };
}

async function resolveStreamerSymbol({
  underlying,
  expiration,
  strike,
  side,
  fallbackSymbol,
}: {
  underlying: string;
  expiration: string;
  strike: number;
  side: ProjectionSide;
  fallbackSymbol: string | null;
}): Promise<{ streamerSymbol: string | null; orderSymbol: string | null }> {
  const chain = await fetchNestedChain(underlying);
  const sideKey = side === "CALL" ? "call" : "put";
  const streamerKey = `${sideKey}-streamer-symbol`;
  const symbolKey = `${sideKey}`;
  for (const item of nestedExpirations(chain)) {
    if (stringValue(item["expiration-date"]) !== expiration) continue;
    const strikes = Array.isArray(item.strikes) ? item.strikes.filter(isRecord) : [];
    for (const row of strikes) {
      const rowStrike = readNumber(row, "strike-price");
      if (rowStrike === null || Math.abs(rowStrike - strike) > 0.001) continue;
      return {
        streamerSymbol: readString(row, streamerKey) ?? streamerSymbolFromOrderSymbol(readString(row, symbolKey)),
        orderSymbol: readString(row, symbolKey) ?? fallbackSymbol,
      };
    }
  }
  return {
    streamerSymbol: streamerSymbolFromOrderSymbol(fallbackSymbol),
    orderSymbol: fallbackSymbol,
  };
}

async function fetchNestedChain(underlying: string): Promise<unknown> {
  const token = await getAccessToken();
  if (!token) return null;
  const candidates = underlying.toUpperCase() === "SPX" ? ["SPX", "$SPX", "SPXW"] : [underlying.toUpperCase()];
  for (const symbol of candidates) {
    try {
      const body = await fetchJson(`${tastytradeBaseUrl()}/option-chains/${encodeURIComponent(symbol)}/nested`, {
        headers: authHeaders(token.accessToken),
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      if (nestedExpirations(body).length) return body;
    } catch {
      // Try the next symbol shape.
    }
  }
  return null;
}

function nestedExpirations(body: unknown): Array<Record<string, unknown>> {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  const items = data && Array.isArray(data.items) ? data.items.filter(isRecord) : [];
  const out: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (typeof item["expiration-date"] === "string") out.push(item);
    const expirations = Array.isArray(item.expirations) ? item.expirations.filter(isRecord) : [];
    out.push(...expirations);
  }
  return out;
}

async function getAccessToken(): Promise<TokenCache | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;

  const clientId = process.env.TASTYTRADE_CLIENT_ID;
  const clientSecret = process.env.TASTYTRADE_CLIENT_SECRET;
  const refreshToken = process.env.TASTYTRADE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const scopes = process.env.TASTYTRADE_OAUTH_SCOPES || "read";
  for (const baseUrl of tastytradeOAuthBaseCandidates()) {
    for (const request of oauthTokenRequests({ clientId, clientSecret, refreshToken, scopes })) {
      try {
        const body = await fetchJson(`${baseUrl}/oauth/token`, {
          method: "POST",
          ...request,
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
        const tokenBody = isRecord(body) && isRecord(body.data) ? body.data : body;
        const accessToken =
          readString(tokenBody, "access_token") ??
          readString(tokenBody, "access-token") ??
          readString(tokenBody, "accessToken");
        if (!accessToken) continue;
        const expiresInSeconds =
          readNumber(tokenBody, "expires_in") ??
          readNumber(tokenBody, "expires-in") ??
          readNumber(tokenBody, "expiresIn") ??
          DEFAULT_TOKEN_TTL_MS / 1000;
        tokenCache = {
          accessToken,
          baseUrl,
          expiresAt: Date.now() + expiresInSeconds * 1000 - TOKEN_REFRESH_SAFETY_MS,
        };
        return tokenCache;
      } catch {
        // Try the next official token shape/base URL.
      }
    }
  }
  tokenCache = null;
  return null;
}

function oauthTokenRequests({
  clientId,
  clientSecret,
  refreshToken,
  scopes,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: string;
}): Array<Pick<RequestInit, "body" | "headers">> {
  const jsonBody = JSON.stringify({
    grant_type: "refresh_token",
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope: scopes,
  });
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope: scopes,
  });
  return [
    {
      body: jsonBody,
      headers: {
        Accept: "application/json",
        "Accept-Version": TASTYTRADE_API_VERSION,
        "Content-Type": "application/json",
        "User-Agent": "SPYProphet/1.0",
      },
    },
    {
      body: form,
      headers: {
        Accept: "application/json",
        "Accept-Version": TASTYTRADE_API_VERSION,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SPYProphet/1.0",
      },
    },
  ];
}

async function getQuoteToken(): Promise<QuoteTokenCache | null> {
  if (quoteTokenCache && quoteTokenCache.expiresAt > Date.now()) return quoteTokenCache;

  const sessionQuoteToken = await getQuoteTokenFromSession();
  if (sessionQuoteToken) return sessionQuoteToken;

  const token = await getAccessToken();
  if (!token) return null;

  authDiagnostic.oauthAttempted = true;
  const body = await fetchJson(`${token.baseUrl}/api-quote-tokens`, {
    method: "GET",
    headers: authHeaders(token.accessToken),
    timeoutMs: REQUEST_TIMEOUT_MS,
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
    authDiagnostic.attempts.push({
      stage: "oauth_quote",
      host: safeHost(token.baseUrl) ?? "unknown",
      status: null,
      ok: false,
      reason: "missing_quote_token",
    });
    return null;
  }
  authDiagnostic.oauthQuoteToken = true;
  authDiagnostic.attempts.push({
    stage: "oauth_quote",
    host: safeHost(token.baseUrl) ?? "unknown",
    status: 200,
    ok: true,
    reason: "quote_token_returned",
  });
  quoteTokenCache = {
    token: quoteToken,
    dxlinkUrl,
    authMode: "oauth",
    expiresAt: Date.now() + QUOTE_TOKEN_TTL_MS,
  };
  return quoteTokenCache;
}

async function getQuoteTokenFromSession(): Promise<QuoteTokenCache | null> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) return null;
  const baseUrl = sessionCache?.baseUrl ?? tastytradeBaseUrl();

  for (const headers of sessionAuthHeaderCandidates(sessionToken)) {
    const host = safeHost(baseUrl) ?? "unknown";
    try {
      const body = await fetchJson(`${baseUrl}/api-quote-tokens`, {
        method: "GET",
        headers,
        timeoutMs: REQUEST_TIMEOUT_MS,
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
      if (!quoteToken || !dxlinkUrl) continue;
      authDiagnostic.sessionQuoteToken = true;
      authDiagnostic.attempts.push({
        stage: "session_quote",
        host,
        status: 200,
        ok: true,
        reason: "quote_token_returned",
      });
      quoteTokenCache = {
        token: quoteToken,
        dxlinkUrl,
        authMode: "session",
        expiresAt: Date.now() + QUOTE_TOKEN_TTL_MS,
      };
      return quoteTokenCache;
    } catch (error) {
      authDiagnostic.attempts.push({
        stage: "session_quote",
        host,
        status: httpStatus(error),
        ok: false,
        reason: publicErrorReason(error),
      });
      // Try the alternate session authorization shape.
    }
  }
  return null;
}

async function getSessionToken(): Promise<string | null> {
  if (sessionCache && sessionCache.expiresAt > Date.now()) {
    return sessionCache.sessionToken;
  }

  const login = process.env.TASTYTRADE_LOGIN || process.env.TASTYTRADE_USERNAME;
  const password = process.env.TASTYTRADE_PASSWORD;
  const rememberToken = process.env.TASTYTRADE_REMEMBER_TOKEN;
  if (!login || (!password && !rememberToken)) return null;

  authDiagnostic.sessionConfigured = true;
  authDiagnostic.sessionAttempted = true;

  const payloads = tastytradeSessionPayloads({ login, password, rememberToken });

  for (const base of tastytradeSessionBaseCandidates()) {
    const host = safeHost(base) ?? "unknown";
    for (const payload of payloads) {
      try {
        const body = await fetchJson(`${base}/sessions`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "SPYProphet/1.0",
          },
          body: JSON.stringify(payload),
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
        const data = isRecord(body) && isRecord(body.data) ? body.data : body;
        const sessionToken =
          readString(data, "session-token") ??
          readString(data, "sessionToken") ??
          readString(data, "token");
        if (!sessionToken) {
          authDiagnostic.attempts.push({
            stage: "session",
            host,
            status: 200,
            ok: false,
            reason: "missing_session_token",
          });
          continue;
        }
        authDiagnostic.sessionCreated = true;
        authDiagnostic.attempts.push({
          stage: "session",
          host,
          status: 200,
          ok: true,
          reason: "session_created",
        });
        sessionCache = {
          sessionToken,
          baseUrl: base,
          expiresAt: Date.now() + 20 * 60_000,
        };
        return sessionToken;
      } catch (error) {
        authDiagnostic.attempts.push({
          stage: "session",
          host,
          status: httpStatus(error),
          ok: false,
          reason: publicErrorReason(error),
        });
        // Try the next payload/base URL.
      }
    }
  }
  return null;
}

function tastytradeSessionPayloads({
  login,
  password,
  rememberToken,
}: {
  login: string;
  password?: string;
  rememberToken?: string;
}): Array<Record<string, unknown>> {
  if (rememberToken) {
    return [
      { login, "remember-token": rememberToken, "remember-me": false },
      { login, rememberToken, rememberMe: false },
    ];
  }
  if (!password) return [];
  return [
    { login, password, "remember-me": true },
    { login, password, rememberMe: true },
  ];
}

function collectDxLinkCandles({
  quoteToken,
  streamerSymbol,
  from,
  to,
  period,
}: {
  quoteToken: QuoteTokenCache;
  streamerSymbol: string;
  from: Date;
  to: Date;
  period: "m" | "5m";
}): Promise<{
  candles: TastytradeOptionCandle[];
  rawMessages: number;
  diagnostic: TastytradeDxLinkDiagnostic;
}> {
  return new Promise((resolve) => {
    let resolved = false;
    let authorized = false;
    let channelRequested = false;
    let feedConfigured = false;
    let setupSent = false;
    let authSent = false;
    let subscriptionSent = false;
    let rawMessages = 0;
    let connectionOpened = false;
    let sentMessages = 0;
    let sendErrors = 0;
    const sentTypes: string[] = [];
    let closeCode: number | null = null;
    let closeReason: string | null = null;
    let errorMessage: string | null = null;
    const candles: TastytradeOptionCandle[] = [];
    const ws = createDxSocket(quoteToken.dxlinkUrl);
    const timeout = setTimeout(() => finish(), DXLINK_TIMEOUT_MS);
    const candleSymbol = `${streamerSymbol}{=${period === "m" ? "1m" : "5m"}}`;
    const fromTime = from.getTime();
    const toTime = to.getTime();

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // No-op.
      }
      resolve({
        candles: dedupeCandles(candles).filter((candle) => {
          const ts = Date.parse(candle.ts);
          return ts >= fromTime && ts <= toTime;
        }),
        rawMessages,
        diagnostic: {
          connectionOpened,
          setupSent,
          authSent,
          channelRequested,
          feedConfigured,
          subscriptionSent,
          closeCode,
          closeReason,
          errorMessage,
          dxlinkHost: `${safeHost(quoteToken.dxlinkUrl) ?? "unknown"} via ${quoteToken.authMode}`,
          sentMessages,
          sendErrors,
          sentTypes,
        },
      });
    };

    const send = (message: Record<string, unknown>) => {
      if (ws.readyState !== 1) return;
      const type = stringValue(message.type) || "UNKNOWN";
      sentTypes.push(type);
      try {
        ws.send(JSON.stringify(message), (error?: Error) => {
          if (error) {
            sendErrors += 1;
            errorMessage = error.message;
          }
        });
        sentMessages += 1;
      } catch (error) {
        sendErrors += 1;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    };

    const authorize = () => {
      if (authSent || authorized) return;
      authSent = true;
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
        acceptAggregationPeriod: 10,
        acceptDataFormat: "COMPACT",
        acceptEventFields: {
          Candle: [
            "eventType",
            "eventSymbol",
            "time",
            "sequence",
            "count",
            "open",
            "high",
            "low",
            "close",
            "volume",
          ],
        },
      });
    };

    const subscribe = () => {
      subscriptionSent = true;
      send({
        type: "FEED_SUBSCRIPTION",
        channel: DXLINK_CHANNEL,
        reset: true,
        add: [
          {
            type: "Candle",
            symbol: candleSymbol,
            fromTime,
          },
        ],
      });
    };

    onSocketOpen(ws, () => {
      connectionOpened = true;
      setupSent = true;
      send({
        type: "SETUP",
        channel: 0,
        version: "0.1-DXF-JS/0.8.1",
        keepaliveTimeout: 60,
        acceptKeepaliveTimeout: 60,
      });
      // The official dxLink client sends AUTH immediately after SETUP when
      // an auth token is already known. Some Tastytrade DXLink endpoints do
      // not emit the first SETUP response unless AUTH is sent in the same
      // opening burst.
      authorize();
    });

    onSocketMessage(ws, (data) => {
      rawMessages += 1;
      const message = parseWsMessage(data);
      candles.push(...extractCandleEvents(message, streamerSymbol));
      if (candles.length >= 20) finish();

      if (!isRecord(message)) return;
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

    onSocketError(ws, (error) => {
      errorMessage = error instanceof Error ? error.message : String(error);
      finish();
    });
    onSocketClose(ws, (code, reason) => {
      closeCode = code;
      closeReason = reason || null;
      finish();
    });
  });
}

function candleBackfillDetail(input: {
  candles: TastytradeOptionCandle[];
  rawMessages: number;
  diagnostic: TastytradeDxLinkDiagnostic;
}): string {
  if (input.candles.length > 0) {
    return `Tastytrade returned ${input.candles.length} historical option candles for the exact contract.`;
  }
  if (!input.diagnostic.connectionOpened) {
    return `DXLink quote socket did not open for historical option candles${input.diagnostic.errorMessage ? `: ${input.diagnostic.errorMessage}` : "."}`;
  }
  if (input.rawMessages === 0) {
    return "DXLink opened, but did not send setup/auth/feed messages before the probe timed out.";
  }
  return "DXLink connected, but no historical candles were returned for the exact contract.";
}

function createDxSocket(url: string): DxRuntimeSocket {
  const NativeSocket = globalThis.WebSocket;
  if (typeof NativeSocket === "function") {
    return new NativeSocket(url) as unknown as DxRuntimeSocket;
  }
  return new NodeWebSocket(url, {
    headers: {
      "User-Agent": "SPYProphet/1.0",
    },
  }) as unknown as DxRuntimeSocket;
}

function onSocketOpen(socket: DxRuntimeSocket, listener: () => void): void {
  if (socket.addEventListener) {
    socket.addEventListener("open", listener);
  } else {
    socket.on?.("open", listener);
  }
}

function onSocketMessage(socket: DxRuntimeSocket, listener: (data: unknown) => void): void {
  if (socket.addEventListener) {
    socket.addEventListener("message", (event: MessageEvent) => listener(event.data));
  } else {
    socket.on?.("message", listener);
  }
}

function onSocketError(socket: DxRuntimeSocket, listener: (error: unknown) => void): void {
  if (socket.addEventListener) {
    socket.addEventListener("error", (event: Event) => listener(event));
  } else {
    socket.on?.("error", listener);
  }
}

function onSocketClose(
  socket: DxRuntimeSocket,
  listener: (code: number | null, reason: string | null) => void,
): void {
  if (socket.addEventListener) {
    socket.addEventListener("close", (event: CloseEvent) => {
      listener(event.code || null, event.reason || null);
    });
  } else {
    socket.on?.("close", (code: number, reason: Buffer) => {
      listener(code, reason?.toString("utf8") || null);
    });
  }
}

function extractCandleEvents(message: unknown, streamerSymbol: string): TastytradeOptionCandle[] {
  const out: TastytradeOptionCandle[] = [];
  walk(message, (record) => {
    const parsed = parseCandleRecord(record, streamerSymbol);
    if (parsed) out.push(parsed);
  });
  return out;
}

function parseCandleRecord(value: unknown, streamerSymbol: string): TastytradeOptionCandle | null {
  if (Array.isArray(value)) return parseCompactCandle(value, streamerSymbol);
  if (!isRecord(value)) return null;
  const eventType = stringValue(value.eventType) || stringValue(value["event-type"]) || stringValue(value.type);
  const eventSymbol = stringValue(value.eventSymbol) || stringValue(value["event-symbol"]) || stringValue(value.symbol);
  if (eventType !== "Candle" || !eventSymbol.includes(streamerSymbol)) return null;
  const open = readNumber(value, "open");
  const high = readNumber(value, "high");
  const low = readNumber(value, "low");
  const close = readNumber(value, "close");
  const time = readNumber(value, "time") ?? readNumber(value, "eventTime") ?? readNumber(value, "event-time");
  if (open === null || high === null || low === null || close === null || time === null) return null;
  return {
    ts: new Date(time).toISOString(),
    open,
    high,
    low,
    close,
    volume: readNumber(value, "volume"),
  };
}

function parseCompactCandle(value: unknown[], streamerSymbol: string): TastytradeOptionCandle | null {
  const type = stringValue(value[0]);
  if (type !== "Candle") return null;
  const eventSymbol = stringValue(value[1]);
  if (!eventSymbol.includes(streamerSymbol)) return null;
  const time = numericValue(value[2]);
  const open = numericValue(value[5]);
  const high = numericValue(value[6]);
  const low = numericValue(value[7]);
  const close = numericValue(value[8]);
  const volume = numericValue(value[9]);
  if (time === null || open === null || high === null || low === null || close === null) return null;
  return {
    ts: new Date(time).toISOString(),
    open,
    high,
    low,
    close,
    volume,
  };
}

function dedupeCandles(candles: TastytradeOptionCandle[]): TastytradeOptionCandle[] {
  return Array.from(
    candles
      .filter((candle) => candle.close > 0)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .reduce((map, candle) => map.set(candle.ts, candle), new Map<string, TastytradeOptionCandle>())
      .values(),
  );
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
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      throw new TastytradeFetchError(res.status, body);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

class TastytradeFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Tastytrade returned HTTP ${status}.`);
    this.name = "TastytradeFetchError";
  }
}

function defaultAuthDiagnostic(): TastytradeAuthDiagnostic {
  return {
    sessionConfigured: hasTastytradeSessionConfig(),
    sessionAttempted: false,
    sessionCreated: false,
    sessionQuoteToken: false,
    oauthAttempted: false,
    oauthQuoteToken: false,
    attempts: [],
  };
}

function httpStatus(error: unknown): number | null {
  return error instanceof TastytradeFetchError ? error.status : null;
}

function publicErrorReason(error: unknown): string {
  if (error instanceof TastytradeFetchError) {
    const body = error.body.toLowerCase();
    if (body.includes("invalid_credentials")) return "invalid_credentials";
    if (body.includes("two") && body.includes("factor")) return "two_factor_required";
    if (body.includes("mfa") || body.includes("otp")) return "two_factor_required";
    if (body.includes("unauthorized")) return "unauthorized";
    if (body.includes("unconfirmed_user")) return "unconfirmed_user";
    return `http_${error.status}`;
  }
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  if (error instanceof Error) return error.name || "request_failed";
  return "request_failed";
}

function authHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Accept-Version": TASTYTRADE_API_VERSION,
    Authorization: `Bearer ${token}`,
    "User-Agent": "SPYProphet/1.0",
  };
}

function sessionAuthHeaderCandidates(sessionToken: string): HeadersInit[] {
  const common = {
    Accept: "application/json",
    "User-Agent": "SPYProphet/1.0",
  };
  return [
    {
      ...common,
      Authorization: sessionToken,
    },
    {
      ...common,
      Authorization: `Bearer ${sessionToken}`,
    },
  ];
}

function tastytradeBaseUrl(): string {
  return process.env.TASTYTRADE_ENV === "certification"
    ? "https://api.cert.tastytrade.com"
    : "https://api.tastytrade.com";
}

function tastytradeOAuthBaseCandidates(): string[] {
  const current = tastytradeBaseUrl();
  const sdkBase = process.env.TASTYTRADE_ENV === "certification"
    ? "https://api.cert.tastyworks.com"
    : "https://api.tastyworks.com";
  return Array.from(new Set([sdkBase, current]));
}

function tastytradeSessionBaseCandidates(): string[] {
  const current = tastytradeBaseUrl();
  const legacy = process.env.TASTYTRADE_ENV === "certification"
    ? "https://api.cert.tastyworks.com"
    : "https://api.tastyworks.com";
  return Array.from(new Set([current, legacy]));
}

function streamerSymbolFromOrderSymbol(symbol: string | null): string | null {
  if (!symbol) return null;
  const compact = symbol.replace(/\s+/g, "");
  const match = compact.match(/^([A-Z]+)(\d{6})([CP])0*(\d+)$/);
  if (!match) return null;
  const [, root, yymmdd, side, strikeRaw] = match;
  const strike = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strike)) return null;
  return `.${root}${yymmdd}${side}${Number.isInteger(strike) ? strike.toFixed(0) : strike}`;
}

function walk(value: unknown, visit: (item: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) walk(item, visit);
  }
}

function emptyResult(
  status: TastytradeOptionBackfillResult["status"],
  detail: string,
  streamerSymbol: string | null,
  orderSymbol: string | null,
): TastytradeOptionBackfillResult {
  return {
    ok: false,
    status,
    detail,
    provider: "tastytrade_dxlink",
    streamerSymbol,
    orderSymbol,
    candles: [],
    rawMessages: 0,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function parseWsMessage(data: unknown): unknown {
  try {
    const text = wsDataToText(data);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function wsDataToText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((item) => Buffer.isBuffer(item) ? item : Buffer.from(item))).toString("utf8");
  }
  return String(data);
}

function numericValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  return numericValue(value[key]);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
