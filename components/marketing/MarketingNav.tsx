"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { label: "Methodology", href: "#methodology" },
  { label: "Surfaces", href: "#surfaces" },
  { label: "Discipline", href: "#manifesto" },
  { label: "FAQ", href: "#faq" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-200 ease-swift",
        scrolled
          ? "bg-canvas/85 backdrop-blur-md border-b border-rule"
          : "bg-transparent border-b border-transparent",
      )}
    >
      <div className="max-w-[1240px] mx-auto px-7 h-[72px] flex items-center gap-8">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <nav
          aria-label="Marketing site sections"
          className="hidden md:flex items-center gap-7 ml-2"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] text-ink-2 hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas rounded-soft -mx-1 px-1"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-[13px] text-ink-2 hover:text-ink transition-colors hidden sm:inline"
          >
            Sign in
          </Link>
          <a href="#waitlist">
            <Button variant="primary" size="sm">
              Join the waitlist <ArrowRight size={13} />
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}
