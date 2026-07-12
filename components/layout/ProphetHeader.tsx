"use client";

import { Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Today" },
  { href: "/map", label: "Map" },
  { href: "/replay", label: "Replay" },
  { href: "/log", label: "Journal" },
  { href: "/agents", label: "Review AI" },
  { href: "/learn", label: "Learn" },
];

export function ProphetHeader() {
  const pathname = usePathname() || "/dashboard";
  const [menuOpen, setMenuOpen] = useState(false);
  const [clock, setClock] = useState("");
  const [alertsReady, setAlertsReady] = useState<boolean | null>(null);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Chicago",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/alerts/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(
        (status: {
          indicatorTelegramBot?: boolean;
          indicatorTelegramChat?: boolean;
        }) =>
          active &&
          setAlertsReady(
            Boolean(
              status.indicatorTelegramBot && status.indicatorTelegramChat,
            ),
          ),
      )
      .catch(() => active && setAlertsReady(false));
    return () => {
      active = false;
    };
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-carbon/95 text-optic shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex h-[68px] items-stretch" data-testid="topbar">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-3 border-r border-white/[0.08] px-4 md:w-[228px] md:px-6"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center border border-mineral/35 bg-mineral/[0.06] text-[16px] font-black text-lime shadow-[inset_0_0_24px_rgba(143,211,200,0.06)]">
              P
            </span>
            <span className="hidden sm:block">
              <span className="block text-[13px] font-black uppercase tracking-[0.08em]">
                SPY Prophet
              </span>
              <span className="microlabel mt-1 block text-[10px] text-white/65">
                Trading workspace
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 px-3 xl:flex"
            aria-label="Primary navigation"
          >
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center px-3.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors 2xl:px-4",
                    active ? "bg-white/[0.07] text-lime after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-mineral" : "text-white/55 hover:bg-white/[0.035] hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-stretch">
            <div className="hidden items-center gap-3 border-l border-white/[0.08] px-4 2xl:flex">
              <span
                className={cn(
                  "h-2.5 w-2.5",
                  alertsReady === true
                    ? "bg-lime"
                    : alertsReady === false
                      ? "bg-coral"
                      : "animate-blink bg-cobalt",
                )}
                aria-hidden="true"
              />
              <div>
                <p className="microlabel text-white/50">Alerts</p>
                <p className="mt-1 text-[11px] font-bold leading-none">
                  {alertsReady === true
                    ? "Connected"
                    : alertsReady === false
                      ? "Needs attention"
                      : "Checking"}
                </p>
              </div>
            </div>
            <div className="hidden min-w-[128px] flex-col items-start justify-center border-l border-white/[0.08] px-4 2xl:flex">
              <p className="microlabel text-white/50">Chicago</p>
              <p className="num mt-1 text-[13px] font-bold leading-none">
                {clock ? `${clock} CT` : "--:--:-- CT"}
              </p>
            </div>
            <Link
              href="/settings"
              aria-current={isActive("/settings") ? "page" : undefined}
              aria-label="Settings"
              title="Settings"
              className={cn(
                "hidden w-[58px] items-center justify-center border-l border-white/[0.08] xl:flex",
                isActive("/settings") ? "bg-white/[0.06] text-lime" : "text-white/65 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <Settings size={17} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="grid w-[58px] place-items-center border-l border-white/10 xl:hidden"
              aria-expanded={menuOpen}
              aria-controls="prophet-mobile-nav"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="prophet-mobile-nav"
            className="grid border-t border-white/10 bg-carbon text-optic xl:hidden"
            aria-label="Mobile navigation"
          >
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                "flex h-16 items-center border-b border-white/15 px-5 text-[15px] font-black uppercase tracking-[0.08em]",
                    active && "bg-white/[0.07] text-lime",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              className={cn(
                "flex h-16 items-center gap-4 px-5 text-[15px] font-black uppercase tracking-[0.08em]",
                isActive("/settings") && "bg-white/[0.07] text-lime",
              )}
            >
              <Settings size={16} aria-hidden="true" />
              Settings
            </Link>
          </nav>
        )}
      </header>
      <div className="flex h-7 items-center overflow-hidden border-b border-white/[0.07] bg-[#0a0e10] px-4 text-optic md:px-6">
        <span className="h-1.5 w-1.5 bg-mineral" aria-hidden="true" />
        <p className="microlabel ml-3 truncate text-white/45">Live workspace</p>
        <p className="microlabel ml-auto hidden text-white/35 sm:block">Verify data before acting</p>
      </div>
    </>
  );
}
