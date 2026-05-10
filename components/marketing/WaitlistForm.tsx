"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { AlertCircle, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  const [referrer, setReferrer] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const out: Record<string, string> = {};
      for (const key of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
      ]) {
        const value = params.get(key);
        if (value) out[key] = value;
      }
      setUtm(out);
      setReferrer(document.referrer || "");
    } catch {
      // SSR-safe no-op.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onTurnstileSuccess = (token: string) => {
      setTurnstileToken(token);
    };
  }, []);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state.kind === "pending") return;
    track({ name: "waitlist_submit_attempt" });

    if (!email.includes("@")) {
      setState({ kind: "error", message: "Please enter a valid email." });
      track({ name: "waitlist_submit_error", reason: "client_validation" });
      return;
    }

    setState({ kind: "pending" });
    try {
      const response = await fetch("/api/waitlist", {
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
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !data.ok) {
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
        "We could not reach the server. Please check your connection and try again.";
      setState({ kind: "error", message });
      track({ name: "waitlist_submit_error", reason: "network" });
    }
  }

  return (
    <section
      id="waitlist"
      className="scroll-mt-[88px] overflow-hidden border-t border-gold/40 bg-[#061017] text-paper"
    >
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
          async
          defer
        />
      )}

      <div className="relative mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:py-28">
        <div className="absolute -right-32 bottom-0 h-[430px] w-[430px] rounded-full border border-paper/10 bg-[radial-gradient(circle_at_50%_45%,rgba(244,228,192,0.12),transparent_62%)]" />
        <div className="relative grid grid-cols-1 items-end gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-soft">
              Closed beta access
            </div>
            <h2 className="mt-5 max-w-2xl font-serif text-display tracking-tight text-paper lg:text-[56px] lg:leading-[1.04]">
              Built for traders who protect first.
            </h2>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-paper/64">
              Leave your email and we will send an invite when the next cohort
              opens. You will also get the weekly Daily Brief in the meantime:
              yesterday's close, tomorrow's setup, so you can read along before
              you are in.
            </p>

            <div className="mt-9 grid max-w-xl grid-cols-3 divide-x divide-paper/15 border-y border-paper/15 py-4">
              <TrustItem label="Real-time structure" />
              <TrustItem label="Transparent logic" />
              <TrustItem label="Discipline first" />
            </div>
          </div>

          <div className="lg:col-span-5">
            {state.kind === "success" ? (
              <SuccessCard />
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="space-y-4 rounded-[10px] border border-paper/14 bg-paper/[0.045] p-6 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.9)]"
              >
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">
                    Email
                  </span>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (state.kind === "error") setState({ kind: "idle" });
                    }}
                    placeholder="you@firm.com"
                    aria-invalid={state.kind === "error"}
                    aria-describedby={
                      state.kind === "error" ? "waitlist-error" : "waitlist-privacy"
                    }
                    className="mt-2 h-11 w-full rounded-[6px] border border-paper/10 bg-[#07141C] px-3 text-[15px] text-paper outline-none transition-shadow placeholder:text-paper/28 focus:shadow-[0_0_0_2px_rgba(184,130,31,0.38)]"
                  />
                </label>

                <div
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-px w-px overflow-hidden"
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
                    className="flex items-start gap-2 text-[12px] text-bear"
                  >
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{state.message}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full justify-center"
                  disabled={state.kind === "pending"}
                >
                  {state.kind === "pending" ? "Adding..." : "Request invite"}
                  {state.kind !== "pending" && <ArrowRight size={15} />}
                </Button>

                <p
                  id="waitlist-privacy"
                  className="text-center text-[11px] text-paper/42"
                >
                  We use your email per our{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-2 hover:text-paper"
                  >
                    Privacy Policy
                  </Link>
                  . No spam - one Daily Brief per morning plus an invite when
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

function TrustItem({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 text-center">
      <ShieldCheck size={14} className="shrink-0 text-gold-soft" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold-soft">
        {label}
      </span>
    </div>
  );
}

function SuccessCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-4 rounded-[10px] border border-paper/14 bg-paper/[0.045] p-7"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[6px] bg-bull/15 text-bull">
        <Check size={18} />
      </div>
      <div>
        <h3 className="mb-1 font-serif text-title text-paper">
          Check your inbox.
        </h3>
        <p className="text-[14px] leading-relaxed text-paper/64">
          We sent a confirmation email. Click the link inside to finish joining
          the waitlist. Until then, expect the Daily Brief in your inbox each
          morning at 6:30 AM ET.
        </p>
      </div>
    </div>
  );
}
