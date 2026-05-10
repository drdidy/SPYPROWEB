import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

const cols = [
  {
    label: "Workspace",
    items: [
      { label: "Decision Slate", href: "/dashboard" },
      { label: "SPY Engine", href: "/spy" },
      { label: "ES Engine", href: "/es" },
      { label: "Foresight", href: "/foresight" },
    ],
  },
  {
    label: "Read",
    items: [
      { label: "Methodology", href: "/methodology" },
      { label: "Discipline", href: "/#manifesto" },
      { label: "FAQ", href: "/#faq" },
      { label: "Daily Brief", href: "/brief" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Careers", href: "/careers" },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Disclosures", href: "/disclosures" },
      { label: "Risk", href: "/risk" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-7">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-12">
          <div className="col-span-2 md:col-span-4">
            <Wordmark />
            <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-ink-2">
              SPY Prophet is a decision workspace for serious retail traders.
              The structure stays the same. What you do with it is on you.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Status
              </span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-bull opacity-50" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bull" />
              </span>
              <span className="text-[12px] text-ink-2">Closed beta</span>
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.label} className="col-span-1 md:col-span-2">
              <div className="eyebrow mb-4 text-ink-3">{col.label}</div>
              <ul className="space-y-2.5">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="rounded-soft px-1 text-[13px] text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/40"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hr-rule mt-10" />

        <div className="mt-6 flex flex-col items-start justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3 md:flex-row md:items-center">
          <span>(C) 2026 SPY Prophet - All rights reserved</span>
          <span className="max-w-2xl font-sans text-[10.5px] normal-case leading-relaxed tracking-normal text-ink-4">
            Not investment advice. Trading futures, equities, and options
            carries substantial risk and is not suitable for every investor.
            Past performance does not guarantee future results.
          </span>
        </div>
      </div>
    </footer>
  );
}
