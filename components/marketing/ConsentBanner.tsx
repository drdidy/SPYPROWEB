"use client";

// GDPR / UK-GDPR-compliant consent banner. Deny by default for non-
// essential cookies / analytics. Persists choice to localStorage so
// the banner doesn't reappear on every visit.

import { useEffect, useState } from "react";
import Link from "next/link";
import { getConsent, setConsent, type ConsentState } from "@/lib/analytics";

export function ConsentBanner() {
  const [consent, setConsentState] = useState<ConsentState>("unset");

  useEffect(() => {
    setConsentState(getConsent());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "accepted" || detail === "denied") {
        setConsentState(detail);
      }
    };
    window.addEventListener("sp:consent", onChange);
    return () => window.removeEventListener("sp:consent", onChange);
  }, []);

  if (consent !== "unset") return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      // Bottom-anchored banner — doesn't block content access.
      // A keyboard user can Tab through page first, then through the
      // banner buttons.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-md"
    >
      <div className="max-w-[1240px] mx-auto px-7 py-4 flex flex-col md:flex-row md:items-center gap-3">
        <p className="text-[12px] text-ink-2 leading-relaxed flex-1">
          We use a small set of essential cookies to run the site. With your
          consent we&apos;ll also load privacy-friendly analytics so we can
          improve the workspace. See our{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-ink"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setConsent("denied")}
            className="h-9 px-4 rounded-pill bg-paper-2 text-ink-2 hover:text-ink hover:bg-paper-2/70 font-mono text-[11px] uppercase tracking-[0.10em] outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => setConsent("accepted")}
            className="h-9 px-4 rounded-pill bg-ink text-paper hover:bg-ink-2 font-mono text-[11px] font-semibold uppercase tracking-[0.10em] outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}
