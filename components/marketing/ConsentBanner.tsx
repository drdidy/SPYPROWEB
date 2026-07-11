"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getConsent, setConsent, type ConsentState } from "@/lib/analytics";

export function ConsentBanner() {
  const [consent, setConsentState] = useState<ConsentState>("unset");

  useEffect(() => {
    setConsentState(getConsent());
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail === "accepted" || detail === "denied") setConsentState(detail);
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
      className="fixed bottom-4 left-4 right-4 z-40 border border-white/30 bg-black text-white shadow-2xl md:left-auto md:w-[460px]"
    >
      <div>
        <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#B8F23D]">Privacy</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/50">Your choice</span>
        </div>
        <p className="px-4 py-3 text-[11px] leading-relaxed text-white/80 md:text-[12px]">
          Essential cookies run SPY Prophet. Allow anonymous analytics to help improve the workspace?{" "}
          <Link
            href="/privacy"
            className="ml-1 font-black text-[#B8F23D] underline underline-offset-4"
          >
            Privacy
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 border-t border-white/20">
          <button
            type="button"
            onClick={() => setConsent("denied")}
            className="min-h-12 border-r border-white/30 px-5 text-[9px] font-black uppercase text-white hover:bg-white hover:text-black"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => setConsent("accepted")}
            className="min-h-12 bg-[#B8F23D] px-5 text-[9px] font-black uppercase text-black hover:bg-white"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}
