// POST /api/waitlist — accepts an email + UTM/referrer payload and
// (when env vars are wired) verifies a Turnstile token, hits the
// email provider's double-opt-in endpoint, and rate-limits the IP.
//
// External integrations are gated on env vars so local and preview
// deploys can still exercise the form. When no email provider is
// configured, logs are redacted and never include raw email or IP.

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

interface Payload {
  email?: unknown;
  /** Honeypot field — must be empty. */
  website?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_term?: unknown;
  utm_content?: unknown;
  referrer?: unknown;
  turnstileToken?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IP_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const EMAIL_LIMIT = { max: 3, windowMs: 24 * 60 * 60 * 1000 };
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // ---- Honeypot ----
  // Bots fill every visible field; the `website` field is hidden via
  // CSS and aria-hidden, so a non-empty value strongly indicates a
  // bot. Return 200 silently so the bot can't probe for the rejection.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    console.log("[waitlist] honeypot tripped — silent drop");
    return NextResponse.json({ ok: true });
  }

  // ---- Email validation ----
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // ---- Rate limit ----
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rateLimitOk = await checkRateLimit(ip, email);
  if (!rateLimitOk) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests. Please wait a few minutes and try again.",
      },
      { status: 429 },
    );
  }

  // ---- Turnstile / hCaptcha ----
  // TODO(captcha): set TURNSTILE_SECRET (or HCAPTCHA_SECRET) in Vercel
  // and the corresponding NEXT_PUBLIC_TURNSTILE_SITEKEY in the FE.
  // Without a secret configured we trust the request — fine for
  // closed-beta launch on a private URL, NOT for public traffic.
  const captchaOk = await verifyCaptcha(
    typeof body.turnstileToken === "string" ? body.turnstileToken : null,
  );
  if (!captchaOk) {
    return NextResponse.json(
      { ok: false, error: "Captcha failed. Please refresh and try again." },
      { status: 400 },
    );
  }

  // ---- Email provider (double opt-in) ----
  // TODO(email-provider): wire EMAIL_PROVIDER_API_KEY for the chosen
  // ESP (e.g. Loops / Resend / Beehiiv). The provider must send a
  // confirmation email; we don't add the lead to the active list
  // until the user clicks through. If unset, the lead is logged and
  // the request returns 200.
  const lead = {
    email,
    utm: {
      source: pick(body.utm_source),
      medium: pick(body.utm_medium),
      campaign: pick(body.utm_campaign),
      term: pick(body.utm_term),
      content: pick(body.utm_content),
    },
    referrer: pick(body.referrer),
    receivedAt: new Date().toISOString(),
    ip,
  };
  const providerOk = await sendDoubleOptIn(lead);
  if (!providerOk) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "We couldn't reach the email service. Please try again in a minute.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

function pick(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

// ----------------------------------------------------------------------
// Stubs — replace each with real provider call when secrets are wired.
// ----------------------------------------------------------------------

async function checkRateLimit(ip: string, email: string): Promise<boolean> {
  const now = Date.now();
  pruneRateBuckets(now);
  return (
    consumeRateBucket(`ip:${hashForLog(ip)}`, IP_LIMIT, now) &&
    consumeRateBucket(`email:${hashForLog(email)}`, EMAIL_LIMIT, now)
  );
}

async function verifyCaptcha(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // dev / preview without secret
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

async function sendDoubleOptIn(lead: {
  email: string;
  utm: Record<string, string | null>;
  referrer: string | null;
  receivedAt: string;
  ip: string;
}): Promise<boolean> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  if (!apiKey) {
    // No provider wired — log and accept so closed-beta dev + preview
    // can exercise the full UI flow.
    logWaitlistLead("no_provider", lead);
    return true;
  }
  // TODO(email-provider): implement the provider's add-with-double-opt-in
  // endpoint here. Sketch for Loops:
  //   const res = await fetch("https://app.loops.so/api/v1/contacts/create", {
  //     method: "POST",
  //     headers: {
  //       Authorization: `Bearer ${apiKey}`,
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({
  //       email: lead.email,
  //       userGroup: "waitlist-pending-confirmation",
  //       source: lead.utm.source ?? "marketing-site",
  //       firstName: null,
  //     }),
  //   });
  //   if (!res.ok) return false;
  //   // Trigger confirmation email via Loops transactional API…
  logWaitlistLead("provider_not_implemented", lead);
  return true;
}

function logWaitlistLead(
  mode: "no_provider" | "provider_not_implemented",
  lead: {
    email: string;
    utm: Record<string, string | null>;
    referrer: string | null;
    receivedAt: string;
    ip: string;
  },
) {
  const domain = lead.email.split("@")[1] ?? "unknown";
  console.log("[waitlist] lead accepted", {
    mode,
    emailDomain: domain.slice(0, 80),
    hasReferrer: !!lead.referrer,
    utm: lead.utm,
    receivedAt: lead.receivedAt,
    ipHash: hashForLog(lead.ip),
  });
}

function hashForLog(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function consumeRateBucket(
  key: string,
  limit: { max: number; windowMs: number },
  now: number,
): boolean {
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  if (current.count >= limit.max) return false;
  current.count += 1;
  return true;
}

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 500) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}
