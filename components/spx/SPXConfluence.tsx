"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SPXAction, SPXConfluenceFactor } from "@/lib/types";

const actionToVariant: Record<SPXAction, "confirmed" | "watching" | "stale"> = {
  TAKE: "confirmed",
  SELECTIVE: "watching",
  STAND_DOWN: "stale",
};

export function SPXConfluence({
  factors,
  score,
  action,
}: {
  factors: SPXConfluenceFactor[];
  score: number;
  action: SPXAction;
}) {
  const liveFactors = factors.filter(
    (factor) => !factor.key.startsWith("factor") && factor.weight > 0,
  );

  return (
    <Card>
      <CardHeader
        eyebrow="Confluence"
        title="Confluence read"
        meta={`${liveFactors.length} live factor${liveFactors.length === 1 ? "" : "s"} in score`}
        action={
          <StatusPill variant={actionToVariant[action]} pulse>
            {action.replace(/_/g, " ")}
          </StatusPill>
        }
      />
      <CardBody className="px-0 pb-0">
        <div className="px-5 py-3 flex items-baseline justify-between border-b border-rule">
          <span className="eyebrow text-ink-3">Score</span>
          <span className="font-mono tabular-nums">
            <span className="text-headline font-semibold text-ink">{score}</span>
            <span className="text-ink-4 text-sm">/100</span>
          </span>
        </div>
        {liveFactors.length === 0 ? (
          <div className="px-5 py-8">
            <div className="font-serif text-headline text-ink-3 italic font-light">
              Confluence not scored yet.
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
              The fan read needs usable session, London, or RTH reaction data
              before this panel can add evidence.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rule spx-confluence-list">
            {liveFactors.map((factor, idx) => (
              <li
                key={factor.key}
                className="px-5 py-3.5 spx-confluence-row"
                style={{ animationDelay: `${idx * 90}ms` }}
              >
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-serif text-[14px] text-ink">
                    {factor.label}
                  </span>
                  <span
                    className="font-mono text-[12px] tabular-nums text-ink-2"
                    data-num
                  >
                    {(factor.value * 100).toFixed(0)}
                    <span className="text-ink-4">
                      {" "}
                      /100 · w {factor.weight.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="h-1 bg-paper-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ink rounded-full spx-confluence-bar"
                    style={
                      {
                        "--bar-width": `${factor.value * 100}%`,
                        animationDelay: `${idx * 90 + 200}ms`,
                      } as React.CSSProperties
                    }
                  />
                </div>
                {factor.note && (
                  <div className="mt-2 text-[12px] leading-relaxed text-ink-3">
                    {factor.note}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <style jsx>{`
        @keyframes spx-conf-row-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spx-conf-bar-fill {
          from { width: 0; }
          to   { width: var(--bar-width, 0%); }
        }
        .spx-confluence-list .spx-confluence-row {
          opacity: 0;
          animation: spx-conf-row-in 360ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .spx-confluence-list .spx-confluence-bar {
          width: 0;
          animation: spx-conf-bar-fill 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .spx-confluence-list .spx-confluence-row,
          .spx-confluence-list .spx-confluence-bar {
            opacity: 1;
            transform: none;
            animation: none;
            width: var(--bar-width, 100%);
          }
        }
      `}</style>
    </Card>
  );
}
