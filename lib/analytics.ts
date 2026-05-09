// Analytics + event dispatch with strict consent gating. GDPR /
// UK-GDPR posture: deny by default. Until the user explicitly clicks
// "Accept" in the consent banner, every track() call is a no-op and
// no third-party script loads.
//
// Provider is gated by env var so we can swap Plausible / GA4 / a
// self-hosted endpoint without touching call sites. Today we ship a
// console logger as the default sink so events are visible during
// dev + preview without committing to a vendor.
//
// To enable analytics in production, set ONE of:
//   NEXT_PUBLIC_PLAUSIBLE_DOMAIN  → loads Plausible script
//   NEXT_PUBLIC_GA4_MEASUREMENT_ID → loads gtag
// (and keep both unset for the console-only sink).

export type ConsentState = "accepted" | "denied" | "unset";
const CONSENT_KEY = "sp.consent.v1";

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return "unset";
  const v = window.localStorage.getItem(CONSENT_KEY);
  return v === "accepted" || v === "denied" ? v : "unset";
}

export function setConsent(value: "accepted" | "denied"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, value);
  // Notify subscribers (e.g. analytics loader) without a full reload.
  window.dispatchEvent(new CustomEvent("sp:consent", { detail: value }));
}

export type AnalyticsEvent =
  | { name: "waitlist_submit_attempt" }
  | { name: "waitlist_submit_success" }
  | { name: "waitlist_submit_error"; reason: string }
  | { name: "surface_card_click"; surface: string }
  | { name: "faq_open"; question: string }
  | { name: "cta_click"; location: string; label: string }
  | { name: "scroll_depth"; depth: 25 | 50 | 75 | 100 };

/**
 * Fire-and-forget event dispatch. No-ops when consent isn't accepted
 * or when running on the server. Safe to call from any component.
 */
export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  if (getConsent() !== "accepted") return;

  // Plausible
  // TODO(plausible): uncomment when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set
  // and the script tag in app/(marketing)/layout.tsx loads. Plausible's
  // global is window.plausible(name, { props }).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plausible = (window as any).plausible as
    | ((name: string, opts?: { props?: Record<string, unknown> }) => void)
    | undefined;
  if (typeof plausible === "function") {
    const { name, ...props } = event as { name: string };
    plausible(name, Object.keys(props).length ? { props } : undefined);
    return;
  }

  // GA4 (gtag) — uncomment if you wire that path instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gtag = (window as any).gtag as
    | ((kind: "event", name: string, params?: Record<string, unknown>) => void)
    | undefined;
  if (typeof gtag === "function") {
    const { name, ...params } = event as { name: string };
    gtag("event", name, params);
    return;
  }

  // Console sink — visible in dev/preview when no provider is wired.
  // eslint-disable-next-line no-console
  console.info("[analytics]", event);
}

/**
 * Sentry stub. Replace with the real `import * as Sentry from "@sentry/nextjs"`
 * call site once SENTRY_DSN is configured. Keeping a stub here means
 * call sites can be wired today without committing to the dep.
 */
export function captureException(err: unknown, ctx?: Record<string, unknown>) {
  if (typeof window === "undefined") {
    // Server-side: log so Vercel captures it in function logs.
    // eslint-disable-next-line no-console
    console.error("[error]", err, ctx);
    return;
  }
  // TODO(sentry): replace with Sentry.captureException(err, { extra: ctx }).
  // eslint-disable-next-line no-console
  console.error("[error]", err, ctx);
}
