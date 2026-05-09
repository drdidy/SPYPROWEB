"use client";
// Closed-beta waitlist form. Posts to /api/waitlist which is a
// scaffold endpoint — see that file for the env vars that wire up
// rate limiting, Turnstile, and the email-provider double opt-in.
//
// The form captures UTM params + referrer, includes a hidden
// honeypot, surfaces success / error / pending states explicitly,
// and links the Privacy Policy adjacent to the input.

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Check, AlertCircle } from "lucide-react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { track } from "@/lib/analytics";

type SubmitState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [referrer, setReferrer] = useState<string>("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement | null>(null);

  // Capture UTM params + referrer once at mount. We persist these
  // alongside the lead so attribution survives signup → invite.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const out: Record<string, string> = {};
      for (const k of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
      ]) {
        const v = params.get(k);
        if (v) out[k] = v;
      }
      setUtm(out);
      setReferrer(document.referrer || "");
    } catch {
      // SSR-safe no-op
    }
  }, []);

  // Cloudflare Turnstile callback — populated when the widget
  // mounts. Wire NEXT_PUBLIC_TURNSTILE_SITEKEY in Vercel to enable.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onTurnstileSuccess = (token: string) => {
      setTurnstileToken(token);
    };
  }, []);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.kind === "pending") return;
    track({ name: "waitlist_submit_attempt" });

    // HTML5 validation already ran (type=email + required); this is
    // a belt-and-braces check.
    if (!email.includes("@")) {
      setState({ kind: "error", message: "Please enter a valid email." });
      track({ name: "waitlist_submit_error", reason: "client_validation" });
      return;
    }

    setState({ kind: "pending" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          website: honeypotRef.current?.value ?? "",
          ...utm,
          referrer,
          turnstileToken,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const message =
          data.error ??
          "Something went wrong on our side. Please try again in a minute.";
        setState({ kind: "error", message });
        track({ name: "waitlist_submit_error", reason: message });
        return;
      }
      setState({ kind: "success" });
      track({ name: "waitlist_submit_success" });
    } catch {
      const message =
        "We couldn't reach the server. Please check your connection and try again.";
      setState({ kind: "error", message });
      track({ name: "waitlist_submit_error", reason: "network" });
    }
  }

  return (
    <section
      id="waitlist"
      className="border-t border-rule bg-paper scroll-mt-[88px]"
    >
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
          async
          defer
        />
      )}
      <div className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
        <SectionLabel number="06">Join the closed beta</SectionLabel>

        <div className="mt-10 grid grid-cols-12 gap-10 items-end">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-serif text-display lg:text-[56px] lg:leading-[1.04] tracking-tight text-ink max-w-2xl">
              We open the workspace to a few traders at a time.
            </h2>
            <p className="mt-5 text-[16px] text-ink-2 leading-relaxed max-w-2xl">
              Leave your email and we&apos;ll send an invite when the next
              cohort opens. You&apos;ll also get the weekly Daily Brief in
              the meantime: yesterday&apos;s close, tomorrow&apos;s setup, so
              you can read along before you&apos;re in.
            </p>
          </div>

          <div className="col-span-12 lg:col-span-5">
            {state.kind === "success" ? (
              <SuccessCard />
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="surface rounded-card p-6 space-y-4"
              >
                <label className="block">
                  <span className="eyebrow text-ink-3">Email</span>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (state.kind === "error") setState({ kind: "idle" });
                    }}
                    placeholder="you@firm.com"
                    aria-invalid={state.kind === "error"}
                    aria-describedby={
                      state.kind === "error" ? "waitlist-error" : "waitlist-privacy"
                    }
                    className="mt-2 w-full h-11 px-3 bg-paper-2 rounded-soft text-[15px] text-ink placeholder:text-ink-4 outline-none shadow-rule focus:shadow-[0_0_0_2px_rgba(184,130,31,0.32)] transition-shadow"
                  />
                </label>

                {/* Honeypot — visually hidden + aria-hidden so a real
                    user can't stumble into it; bots will fill it. */}
                <div
                  aria-hidden="true"
                  className="absolute -left-[9999px] w-px h-px overflow-hidden"
                >
                  <label>
                    Website
                    <input
                      ref={honeypotRef}
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      defaultValue=""
                    />
                  </label>
                </div>

                {/* Cloudflare Turnstile widget — only renders when the
                    site key is configured. Until then the captcha
                    check on the server is a no-op (dev/preview). */}
                {turnstileSiteKey && (
                  <div
                    className="cf-turnstile"
                    data-sitekey={turnstileSiteKey}
                    data-callback="onTurnstileSuccess"
                  />
                )}

                {state.kind === "error" && (
                  <div
                    id="waitlist-error"
                    role="alert"
                    className="flex items-start gap-2 text-[12px] text-state-bearish"
                  >
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{state.message}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={state.kind === "pending"}
                >
                  {state.kind === "pending" ? "Adding…" : "Request invite"}
                  {state.kind !== "pending" && <ArrowRight size={15} />}
                </Button>

                <p
                  id="waitlist-privacy"
                  className="text-[11px] text-ink-3 text-center"
                >
                  We use your email per our{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    Privacy Policy
                  </Link>
                  . No spam — one Daily Brief per morning + an invite when
                  ready.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SuccessCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="surface rounded-card p-7 flex items-start gap-4"
    >
      <div className="w-10 h-10 rounded-soft bg-bull-tint grid place-items-center text-bull-ink shrink-0">
        <Check size={18} />
      </div>
      <div>
        <h3 className="font-serif text-title text-ink mb-1">
          Check your inbox.
        </h3>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          We sent a confirmation email. Click the link inside to finish
          joining the waitlist. Until then, expect the Daily Brief in your
          inbox each morning at 6:30 AM ET.
        </p>
      </div>
    </div>
  );
}
