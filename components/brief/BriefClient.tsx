"use client";

import { Copy, FileDown, HelpCircle, Printer, Search, Send, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { briefGlossary, type BriefGlossaryKey } from "@/content/brief/glossary";
import { cn } from "@/lib/utils";

export function TermHelp({ term }: { term: BriefGlossaryKey }) {
  const entry = briefGlossary[term];
  return (
    <InfoTooltip label={entry.term} content={entry.definition}>
      <span className="ml-1 inline-grid h-4 w-4 place-items-center rounded-full border border-rule bg-paper-2 text-[10px] text-ink-3">
        ?
      </span>
    </InfoTooltip>
  );
}

export function GlossaryDrawerButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(briefGlossary).filter(([key, value]) => {
      if (!q) return true;
      return `${key} ${value.term} ${value.definition}`.toLowerCase().includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <HelpCircle className="h-4 w-4" />
        Glossary
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/25" role="dialog" aria-modal="true" aria-label="Brief glossary">
          <button className="absolute inset-0 cursor-default" aria-label="Close glossary" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-rule bg-paper p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-[28px] leading-tight text-ink">Glossary</h2>
                <p className="mt-1 text-sm text-ink-3">Plain-English definitions for the Open Brief.</p>
              </div>
              <button
                type="button"
                aria-label="Close glossary"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-soft border border-rule bg-paper-2 text-ink-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 flex items-center gap-2 rounded-[12px] border border-rule bg-paper-2 px-3 py-2">
              <Search className="h-4 w-4 text-ink-3" />
              <span className="sr-only">Search glossary</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search terms"
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink-4"
              />
            </label>
            <div className="mt-4 space-y-3">
              {rows.map(([key, value]) => (
                <article key={key} className="rounded-[12px] border border-rule bg-paper-2/70 p-3">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold-ink">{value.term}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{value.definition}</p>
                  {value.href && (
                    <a className="mt-2 inline-block text-xs font-semibold text-ink underline decoration-gold/50 underline-offset-4" href={value.href}>
                      Learn more
                    </a>
                  )}
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export function ActionToolbar({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label="Copy brief as text">
        <Copy className="h-4 w-4" />
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => window.print()} aria-label="Export brief as PDF">
        <FileDown className="h-4 w-4" />
        <span className="hidden sm:inline">Export PDF</span>
      </Button>
      <a
        href="/dashboard"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-soft bg-paper px-3 text-xs font-medium text-ink shadow-rule hover:bg-paper-2/60"
        aria-label="Send to Decision Slate"
      >
        <Send className="h-4 w-4" />
        <span className="hidden sm:inline">Decision Slate</span>
      </a>
      <Button type="button" size="sm" variant="secondary" onClick={() => window.print()} aria-label="Print brief">
        <Printer className="h-4 w-4" />
        <span className="hidden sm:inline">Print</span>
      </Button>
      <GlossaryDrawerButton />
    </div>
  );
}

export function StickySubnav() {
  const [active, setActive] = useState("read-first");
  useEffect(() => {
    const ids = ["read-first", "lines", "options", "news-calendar"];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-110px 0px -65% 0px", threshold: [0.1, 0.35, 0.65] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="sticky top-[46px] z-20 -mx-3 overflow-x-auto border-b border-rule bg-canvas/95 px-3 py-2 backdrop-blur print:hidden md:-mx-5 md:px-5">
      <div className="flex min-w-max items-center gap-2">
        {[
          ["read-first", "Read First"],
          ["lines", "Lines"],
          ["options", "Options"],
          ["news-calendar", "News & Calendar"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={cn(
              "rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.10em]",
              active === id ? "border-gold bg-gold-tint text-gold-ink" : "border-rule bg-paper text-ink-3 hover:text-ink",
            )}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function LineLegend() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(localStorage.getItem("brief-line-legend-hidden") === "1");
  }, []);
  if (hidden) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-paper-2 px-3 py-2">
      <div className="flex flex-wrap gap-2 text-[12px] text-ink-2">
        <LegendTerm label="WATCHING" note="nearby, no confirmed action" />
        <LegendTerm label="ARMED" note="eligible for confirmation" />
        <LegendTerm label="BREACHED" note="price moved through it" />
        <LegendTerm label="CLEAR" note="not active this session" />
      </div>
      <button
        type="button"
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 underline decoration-rule underline-offset-4 hover:text-ink"
        onClick={() => {
          localStorage.setItem("brief-line-legend-hidden", "1");
          setHidden(true);
        }}
      >
        Don't show again
      </button>
    </div>
  );
}

function LegendTerm({ label, note }: { label: string; note: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-rule bg-paper px-2.5 py-1">
      <span className="font-mono text-[10px] font-semibold tracking-[0.10em] text-ink">{label}</span>
      <span className="text-ink-3">{note}</span>
    </span>
  );
}

export function BriefToken({ value, children }: { value: string; children: ReactNode }) {
  const token = value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  const [active, setActive] = useState(false);
  useEffect(() => {
    const matches = Array.from(document.querySelectorAll<HTMLElement>(`[data-brief-token="${token}"]`));
    if (active) matches.forEach((el) => el.classList.add("bg-gold-tint", "ring-1", "ring-gold/30"));
    return () => {
      matches.forEach((el) => el.classList.remove("bg-gold-tint", "ring-1", "ring-gold/30"));
    };
  }, [active, token]);
  return (
    <span
      data-brief-token={token}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      tabIndex={0}
      className="rounded-[4px] px-0.5 font-mono tabular-nums decoration-gold/40 underline-offset-4 hover:bg-gold-tint hover:underline focus:bg-gold-tint focus:outline-none focus:ring-2 focus:ring-gold/40"
    >
      {children}
    </span>
  );
}
