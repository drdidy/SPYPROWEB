import { NextResponse, type NextRequest } from "next/server";

import {
  appendEmaFibAlertRecord,
  buildEmaFibAlertId,
  normalizeEmaFibPayload,
  parseEmaFibPayload,
  readEmaFibAlerts,
  sendAlertNotification,
  validateEmaFibAlert,
} from "@/lib/ema-fib-alerts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const records = await readEmaFibAlerts(Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ records });
}

export async function POST(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const raw = await readBody(req);
  if (raw === null) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseEmaFibPayload(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid EMA/Fib alert payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const payload = normalizeEmaFibPayload(parsed.data);
  const validation = validateEmaFibAlert(payload);
  const notification = await sendAlertNotification(payload, validation);
  const record = {
    id: buildEmaFibAlertId(payload),
    receivedAt: new Date().toISOString(),
    status: validation.status,
    reasons: validation.reasons,
    payload,
    notification,
  };

  const saved = await appendEmaFibAlertRecord(record);

  return NextResponse.json({
    ok: validation.status === "accepted",
    inserted: saved.inserted,
    record: saved.record,
  });
}

async function readBody(req: NextRequest): Promise<unknown | null> {
  const text = await req.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function authorize(req: NextRequest):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const configured = [
    process.env.SPYPROPHET_TRADINGVIEW_WEBHOOK_SECRET,
    process.env.ALERT_SECRET,
  ].filter((value): value is string => !!value);
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (configured.length === 0) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        error: "TradingView webhook secret is not configured.",
      };
    }
    return { ok: true };
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const headerToken = req.headers.get("x-spyprophet-secret");
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const supplied = queryToken || headerToken || bearer;

  if (!supplied || !configured.includes(supplied)) {
    return { ok: false, status: 401, error: "Unauthorized TradingView webhook." };
  }

  return { ok: true };
}
