"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const links = [
  { label: "Methodology", href: "#methodology" },
  { label: "Engines", href: "#surfaces" },
  { label: "Workflow", href: "#workflow" },
  { label: "Dashboard", href: "/dashboard" },
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
        "sticky top-0 z-40 border-b transition-all duration-200 ease-swift",
        scrolled
          ? "border-rule bg-[#FBF8EF]/88 backdrop-blur-md"
          : "border-rule/70 bg-[#FBF8EF]",
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-8 px-5 sm:px-7">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <nav
          aria-label="Marketing site sections"
          className="hidden items-center gap-7 md:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-soft px-1 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <a href="#waitlist">
            <Button variant="secondary" size="sm" className="min-h-[44px] sm:min-h-0">
              Request beta access <ArrowRight size={13} />
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}
