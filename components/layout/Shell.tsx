"use client";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { AppFooter } from "./AppFooter";

export function Shell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const hasRouteFooter = ["/dashboard", "/brief", "/spy", "/es"].includes(pathname || "");

  // Auto-close the mobile drawer on navigation so the user lands on
  // the new page without the menu still covering it.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[#050D12]">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {/* Mobile drawer backdrop. Hidden at lg+ where the sidebar is permanent. */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(244,228,192,0.16),transparent_28%),radial-gradient(circle_at_86%_2%,rgba(10,117,137,0.16),transparent_30%),linear-gradient(180deg,#08131A_0%,#050D12_72%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.08)_1px,transparent_1px)] bg-[size:48px_48px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-20 h-[440px] w-[440px] rounded-full border border-gold/15 opacity-40"
        />
        <TopBar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenNav={() => setNavOpen(true)}
        />
        {/* v7 P2-3: overflow-x clip safety net. A bug that escapes
            into a cell-level overflow (e.g. a stepper that ignores
            its parent grid track) is contained here so the page
            itself never gets a horizontal scrollbar. `clip` is
            preferred over `hidden` because it doesn't establish
            a new scroll container — sticky descendants keep working. */}
        <main className="relative flex-1 overflow-x-clip px-3 py-4 md:px-6 md:py-6">
          <div className="mx-auto min-h-[calc(100vh-92px)] w-full rounded-[22px] border border-[#E1C98F]/35 bg-[#FAF8F3] p-3 shadow-[0_34px_90px_-44px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.92)] md:p-5">
            <div className="relative overflow-hidden rounded-[16px] border border-rule/80 bg-[linear-gradient(180deg,#FFFCF5_0%,#FAF8F3_48%,#F4EFE3_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_18%_0%,rgba(184,130,31,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.82),transparent)]"
              />
              <div className="relative">
                {children}
                {!hasRouteFooter && <AppFooter />}
              </div>
            </div>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
