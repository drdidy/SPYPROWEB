"use client";

// Fires `scroll_depth` analytics events at 25 / 50 / 75 / 100% of the
// page height. Each milestone fires at most once per session.

import { useEffect } from "react";
import { track } from "@/lib/analytics";

const MILESTONES: ReadonlyArray<25 | 50 | 75 | 100> = [25, 50, 75, 100];

export function ScrollDepthTracker() {
  useEffect(() => {
    const fired = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = doc.scrollHeight;
      if (total <= 0) return;
      const pct = Math.min(100, Math.round((scrolled / total) * 100));
      for (const m of MILESTONES) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          track({ name: "scroll_depth", depth: m });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
