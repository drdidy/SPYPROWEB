"use client";
// URL-driven replay date picker. Mounted at the top of /spy and /spx.
// Setting a date pushes ?date=YYYY-MM-DD onto the URL; clearing it
// removes the param. The page is server-rendered against
// searchParams, so changing the URL re-fetches the engine for that
// historical day.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { CalendarDays, X, Loader2 } from "lucide-react";

interface Props {
  current: string | null;
}

export function ReplayBar({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(current ?? "");

  useEffect(() => {
    setDraft(current ?? "");
  }, [current]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const isReplay = !!current;

  const apply = (next: string | null) => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next) sp.set("date", next);
    else sp.delete("date");
    const qs = sp.toString();
    start(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-soft px-3 py-2 ${
        isReplay
          ? "bg-gold-tint/60 ring-1 ring-gold/30"
          : "bg-paper-2 ring-1 ring-rule"
      }`}
    >
      <CalendarDays
        size={14}
        className={isReplay ? "text-gold-ink" : "text-ink-3"}
        strokeWidth={1.6}
      />
      <span
        className={`eyebrow ${isReplay ? "text-gold-ink" : "text-ink-3"}`}
      >
        {isReplay ? "Replay" : "Live"}
      </span>
      <input
        type="date"
        max={todayISO}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft && draft !== current) apply(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft) apply(draft);
        }}
        className="bg-paper border border-rule rounded-pill px-2 py-1 font-mono text-[11px] text-ink tabular-nums focus:outline-none focus:ring-1 focus:ring-ink-3"
      />
      {isReplay && (
        <button
          type="button"
          onClick={() => apply(null)}
          className="inline-flex items-center gap-1 rounded-pill bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors ring-1 ring-rule"
        >
          <X size={11} strokeWidth={2} />
          Live
        </button>
      )}
      {pending && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-3">
          <Loader2 size={11} className="animate-spin" strokeWidth={2} />
          loading…
        </span>
      )}
    </div>
  );
}
