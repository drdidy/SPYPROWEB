"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
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
  const placeholderCount = factors.filter((f) =>
    f.key.startsWith("factor"),
  ).length;
  const provisional = placeholderCount > 0;

  return (
    <Card>
      <CardHeader
        eyebrow="Confluence"
        title="Five-factor read"
        meta={
          provisional
            ? `Provisional · ${placeholderCount} factor${placeholderCount === 1 ? "" : "s"} pending spec`
            : "Each factor 0–1, weighted; sum × 100 = score"
        }
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
        <ul className="divide-y divide-rule">
          {factors.map((f) => {
            const placeholder = f.key.startsWith("factor");
            return (
              <li key={f.key} className="px-5 py-3.5">
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-serif text-[14px] ${placeholder ? "text-ink-3 italic" : "text-ink"}`}
                    >
                      {f.label}
                    </span>
                    {placeholder && (
                      <span className="text-[9px] font-mono text-ink-4 uppercase tracking-[0.10em] px-1.5 py-0.5 rounded bg-paper-2">
                        placeholder
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono text-[12px] tabular-nums ${placeholder ? "text-ink-4" : "text-ink-2"}`}
                    data-num
                  >
                    {placeholder ? "—" : (f.value * 100).toFixed(0)}
                    <span className="text-ink-4">
                      {" "}
                      · w {f.weight.toFixed(2)}
                    </span>
                  </span>
                </div>
                {placeholder ? (
                  // Dashed outline at zero — does not visually contribute.
                  <div className="h-1 rounded-full border border-dashed border-rule-strong" />
                ) : (
                  <div className="h-1 bg-paper-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink rounded-full"
                      style={{ width: `${f.value * 100}%` }}
                    />
                  </div>
                )}
                {f.note && (
                  <div
                    className={`mt-2 text-[12px] leading-relaxed ${placeholder ? "text-ink-4" : "text-ink-3"}`}
                  >
                    {f.note}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
