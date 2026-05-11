// EngineCard — the slate's standardized verdict-card chassis. Every
// engine card on the dashboard now flows through this so SPY and SPX
// share an identical anatomy, padding, and visual hierarchy:
//
//   ┌──────────────────────────────────────────┐
//   │ EYEBROW (ticker · section)               │ ← <header>
//   │ Title (display serif)        meta-pill   │
//   ├──────────────────────────────────────────┤
//   │ Body / explanation paragraph              │
//   │ ┌──────────────────────────────────────┐ │
//   │ │ Metrics row (3 columns)              │ │
//   │ └──────────────────────────────────────┘ │
//   │ Conditional callouts                      │
//   ├──────────────────────────────────────────┤
//   │ footer: "Updated 10:50 CT"   primary CTA │
//   └──────────────────────────────────────────┘
//
// Built atop the existing <Card /> primitive (paper shadow, rounded
// edges, flex-fill heights so two adjacent cards bottom-align).

import { type ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AsOfTicker } from "@/components/slate/AsOfTicker";
import { FeedHeartbeat } from "@/components/decision-slate/FeedHealthProvider";
import { displayEngine } from "@/lib/engine-labels";
import { cn } from "@/lib/utils";
import type { FeedId } from "@/lib/feed-health";

export interface EngineCardProps {
  engine: "SPY" | "SPX";
  /** Section descriptor for the eyebrow ("today's read", "active levels"). */
  section: string;
  /** Card title — typically a <span> with serif text + price. */
  title: ReactNode;
  /** Optional cluster of meta nodes to the right of the title. */
  headerMeta?: ReactNode;
  /** Panel feed represented by the heartbeat dot in the header. */
  feedId?: FeedId;
  /** Body content (paragraph, metrics, callouts). */
  children: ReactNode;
  /** ISO timestamp for the footer "Updated …" stamp. Pass null to hide. */
  asOfIso?: string | null;
  /** Optional footer-left node (e.g. "Why this state?" link). */
  footerLeft?: ReactNode;
  className?: string;
}

const ENGINE_TONE: Record<"SPY" | "SPX", string> = {
  SPY: "text-ink-3",
  SPX: "text-violet",
};

export function EngineCard({
  engine,
  section,
  title,
  headerMeta,
  feedId,
  children,
  asOfIso,
  footerLeft,
  className,
}: EngineCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "font-mono text-[10px] tracking-[0.18em] uppercase font-bold",
                ENGINE_TONE[engine],
              )}
            >
              {/* v8 P1-2: SPX renders as "ES" everywhere on
                  /dashboard. ENGINE_TONE keys off the wire
                  identifier; the displayed text is mapped at
                  render time. */}
              {displayEngine(engine)}
            </span>
            <span className="text-ink-4" aria-hidden>
              ·
            </span>
            <span className="text-ink-3 normal-case font-medium tracking-[0.12em] text-[10px]">
              {section}
            </span>
          </span>
        }
        title={title}
        action={
          <span className="inline-flex items-center gap-2">
            {headerMeta}
            {feedId && <FeedHeartbeat feedId={feedId} />}
          </span>
        }
      />
      <CardBody className="space-y-4 flex flex-col flex-1">
        {children}
        {(asOfIso || footerLeft) && (
          <div
            className={cn(
              // mt-auto pins the footer to the bottom of the flex-col
              // body so two adjacent cards bottom-align even when their
              // body height differs.
              "mt-auto pt-3 border-t border-rule",
              "flex items-center justify-between gap-3",
            )}
          >
            <div className="min-w-0 flex-1">{footerLeft}</div>
            {asOfIso && <AsOfTicker iso={asOfIso} />}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

