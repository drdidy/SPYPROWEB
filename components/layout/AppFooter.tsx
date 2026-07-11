import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/dashboard", label: "Today" },
  { href: "/map", label: "Map" },
  { href: "/replay", label: "Replay" },
  { href: "/log", label: "Journal" },
  { href: "/agents", label: "Review AI" },
  { href: "/learn", label: "Learn" },
];

const LEGAL_LINKS = [
  { href: "/methodology", label: "Methodology" },
  { href: "/risk", label: "Risk" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/disclosures", label: "Disclosures" },
  { href: "/contact", label: "Contact" },
];

export function AppFooter() {
  return (
    <footer className="border-t border-carbon bg-carbon text-optic">
      <div className="grid lg:grid-cols-[1.1fr_0.45fr_0.45fr]">
        <div className="border-b border-white/15 p-6 md:p-9 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center bg-lime text-[16px] font-black text-carbon">
              P
            </span>
            <span className="text-[14px] font-black uppercase tracking-[0.08em]">
              SPY Prophet
            </span>
          </div>
          <p className="mt-6 max-w-[460px] text-[13px] leading-relaxed text-white/60">
            A market decision instrument for SPY, ES, and SPXW. Context before
            entry. Proof before action. Defined risk before execution.
          </p>
          <p className="microlabel mt-6 text-white/60">
            Decision support, not financial advice
          </p>
        </div>
        <nav
          className="border-b border-white/15 p-6 md:p-9 lg:border-b-0 lg:border-r"
          aria-label="Product"
        >
          <p className="microlabel text-lime">Instrument</p>
          <ul className="mt-5 space-y-3">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[13px] font-bold text-white/75 transition-colors hover:text-lime"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="p-6 md:p-9" aria-label="Legal">
          <p className="microlabel text-lime">Company</p>
          <ul className="mt-5 space-y-3">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[13px] font-bold text-white/75 transition-colors hover:text-lime"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 px-6 py-4 md:px-9">
        <p className="microlabel text-white/60">
          © {new Date().getFullYear()} SPY Prophet / Chicago
        </p>
        <p className="microlabel ml-auto text-white/60">
          Markets involve risk of loss
        </p>
      </div>
    </footer>
  );
}
