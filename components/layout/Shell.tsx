"use client";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";

export function Shell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close the mobile drawer on navigation so the user lands on
  // the new page without the menu still covering it.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
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
      <div className="flex-1 flex flex-col min-w-0 relative">
        <TopBar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenNav={() => setNavOpen(true)}
        />
        <main className="flex-1 px-4 md:px-7 py-5 md:py-6">{children}</main>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas via-canvas/80 to-transparent" />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
