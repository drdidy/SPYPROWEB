"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Today", index: "01" },
  { href: "/map", label: "Map", index: "02" },
  { href: "/replay", label: "Replay", index: "03" },
  { href: "/log", label: "Journal", index: "04" },
  { href: "/agents", label: "Review AI", index: "05" },
  { href: "/learn", label: "Learn", index: "06" },
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
      <header className="sticky top-0 z-50 border-b border-carbon bg-optic">
        <div className="flex h-[64px] items-stretch" data-testid="topbar">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-3 border-r border-carbon px-4 md:w-[228px] md:px-6"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center bg-carbon text-[16px] font-black text-lime">
              P
            </span>
            <span className="hidden sm:block">
              <span className="block text-[13px] font-black uppercase tracking-[0.08em]">
                SPY Prophet
              </span>
              <span className="microlabel mt-1 block text-[10px] text-carbon/60">
                Decision system
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-stretch lg:flex"
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
                    "relative flex items-center gap-2.5 border-r border-carbon/15 px-5 text-[12px] font-black uppercase tracking-[0.08em] transition-colors xl:px-6",
                    active ? "bg-lime text-carbon" : "hover:bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[10px] font-bold",
                      active ? "text-carbon/70" : "text-cobalt",
                    )}
                  >
                    {item.index}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-stretch">
            <div className="hidden items-center gap-3 border-l border-carbon/15 px-5 md:flex">
              <span
                className={cn(
                  "h-2.5 w-2.5",
                  alertsReady === true
                    ? "bg-go-ink"
                    : alertsReady === false
                      ? "bg-coral"
                      : "animate-blink bg-cobalt",
                )}
                aria-hidden="true"
              />
              <div>
                <p className="microlabel text-carbon/60">Telegram</p>
                <p className="mt-1 text-[11px] font-bold leading-none">
                  {alertsReady === true
                    ? "Connected"
                    : alertsReady === false
                      ? "Needs attention"
                      : "Checking"}
                </p>
              </div>
            </div>
            <div className="hidden min-w-[128px] flex-col items-start justify-center border-l border-carbon/15 px-5 xl:flex">
              <p className="microlabel text-carbon/60">Chicago</p>
              <p className="num mt-1 text-[13px] font-bold leading-none">
                {clock ? `${clock} CT` : "--:--:-- CT"}
              </p>
            </div>
            <Link
              href="/settings"
              aria-current={isActive("/settings") ? "page" : undefined}
              className={cn(
                "hidden items-center border-l border-carbon/15 px-5 text-[12px] font-black uppercase tracking-[0.08em] lg:flex",
                isActive("/settings") ? "bg-lime" : "hover:bg-white",
              )}
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="grid w-[58px] place-items-center border-l border-carbon/15 lg:hidden"
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
            className="grid border-t border-carbon bg-carbon text-optic lg:hidden"
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
                    "flex h-16 items-center gap-4 border-b border-white/15 px-5 text-[15px] font-black uppercase tracking-[0.08em]",
                    active && "bg-lime text-carbon",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[10px] font-bold",
                      active ? "text-carbon/70" : "text-lime",
                    )}
                  >
                    {item.index}
                  </span>
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              className={cn(
                "flex h-16 items-center gap-4 px-5 text-[15px] font-black uppercase tracking-[0.08em]",
                isActive("/settings") && "bg-lime text-carbon",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px] font-bold",
                  isActive("/settings") ? "text-carbon/70" : "text-lime",
                )}
              >
                07
              </span>
              Settings
            </Link>
          </nav>
        )}
      </header>
      <div className="flex h-8 items-center overflow-hidden border-b border-carbon bg-carbon text-optic">
        <p className="microlabel flex h-full shrink-0 items-center bg-cobalt px-4 text-white">
          Operating rule
        </p>
        <p className="truncate px-4 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
          No verified source. No command. No contract. No exception.
        </p>
      </div>
    </>
  );
}
