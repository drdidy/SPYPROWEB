"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppFooter } from "@/components/layout/AppFooter";
import { ConsentBanner } from "@/components/marketing/ConsentBanner";
import { ScrollDepthTracker } from "@/components/marketing/ScrollDepthTracker";

export function MarketingFrame({ children }: { children: React.ReactNode }) {
  const home = usePathname() === "/";
  return (
    <div className="min-h-screen bg-optic text-carbon">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:bg-lime focus:px-3 focus:py-2 focus:text-[11px] focus:font-black"
      >
        Skip to content
      </a>
      {!home && (
        <header className="flex h-[64px] items-center border-b border-white/10 bg-carbon px-5 text-optic md:px-9">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center border border-mineral/30 bg-white/[0.04] text-[16px] font-black text-lime">
              P
            </span>
            <span>
              <span className="block text-[13px] font-black uppercase tracking-[0.08em]">
                SPY Prophet
              </span>
              <span className="microlabel mt-0.5 block text-white/65">
                Private intelligence
              </span>
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="ml-auto border border-mineral/30 px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em] text-mineral transition-colors hover:bg-mineral hover:text-carbon"
          >
            Open console
          </Link>
        </header>
      )}
      <main id="main">{children}</main>
      {!home && <AppFooter />}
      <ConsentBanner />
      <ScrollDepthTracker />
    </div>
  );
}
