import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

const cols = [
  {
    label: "Workspace",
    items: [
      { label: "Decision Slate", href: "/dashboard" },
      { label: "SPX Channel", href: "/spx" },
      { label: "Structure Read", href: "/structure" },
      { label: "Foresight", href: "/foresight" },
    ],
  },
  {
    label: "Read",
    items: [
      { label: "Methodology", href: "#methodology" },
      { label: "Discipline", href: "#manifesto" },
      { label: "FAQ", href: "#faq" },
      { label: "Daily Brief", href: "/brief" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: "#" },
      { label: "Press", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Terms", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Disclosures", href: "#" },
      { label: "Risk", href: "#" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule mt-32 bg-paper">
      <div className="max-w-[1240px] mx-auto px-7 py-14">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-4">
            <Wordmark />
            <p className="mt-5 text-[13px] text-ink-2 leading-relaxed max-w-sm">
              SPY Prophet is a decision workspace for serious retail traders.
              The structure stays the same. What you do with it is on you.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="font-mono text-[10px] text-ink-3 tracking-[0.18em] uppercase">
                Status
              </span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-50 animate-breathe" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-bull" />
              </span>
              <span className="text-[12px] text-ink-2">All systems operational</span>
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.label} className="col-span-6 md:col-span-2">
              <div className="eyebrow text-ink-3 mb-4">{c.label}</div>
              <ul className="space-y-2.5">
                {c.items.map((it) => (
                  <li key={it.label}>
                    <Link
                      href={it.href}
                      className="text-[13px] text-ink-2 hover:text-ink transition-colors"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hr-rule mt-10" />

        <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[11px] text-ink-3 font-mono uppercase tracking-[0.16em]">
          <span>© 2026 SPY Prophet · All rights reserved</span>
          <span className="text-ink-4 normal-case tracking-normal max-w-2xl text-[10.5px] font-sans leading-relaxed">
            Not investment advice. Trading futures, equities, and options carries
            substantial risk and is not suitable for every investor. Past
            performance does not guarantee future results.
          </span>
        </div>
      </div>
    </footer>
  );
}
