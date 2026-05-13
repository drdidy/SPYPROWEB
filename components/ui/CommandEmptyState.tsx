import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CommandEmptyState({
  eyebrow,
  title,
  body,
  rows = [],
  action,
  className,
}: {
  eyebrow: string;
  title: string;
  body: string;
  rows?: Array<{ label: string; value: string }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[18px] border border-[#D6BC75]/35 bg-[#071116] text-paper shadow-[0_24px_70px_-40px_rgba(7,17,22,0.95)]",
        className,
      )}
    >
      <div className="absolute inset-0 opacity-[0.16] bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:36px_36px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 p-6 md:p-8">
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">
            {eyebrow}
          </div>
          <h3 className="mt-3 font-serif text-[34px] leading-none tracking-tight text-paper">
            {title}
          </h3>
          <p className="mt-4 text-[14px] leading-relaxed text-paper/68">{body}</p>
          {rows.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:hidden">
              {rows.map((row) => (
                <div
                  key={row.label}
              className="border border-paper/10 bg-paper/[0.055] px-3 py-2.5 rounded-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-paper/40">
                    {row.label}
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-paper/85">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {action && <div className="mt-6">{action}</div>}
        </div>
        <ReadinessPanel rows={rows} />
      </div>
    </div>
  );
}

function ReadinessPanel({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  const readinessRows =
    rows.length > 0
      ? rows
      : [
          { label: "Status", value: "Unavailable" },
          { label: "Display rule", value: "No synthetic data" },
          { label: "Next step", value: "Waiting for source" },
        ];

  return (
    <div className="hidden lg:flex min-h-[220px] flex-col rounded-card border border-paper/10 bg-paper/[0.035] p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">
        Current status
      </div>
      <div className="mt-4 space-y-2.5">
        {readinessRows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className="rounded-[8px] border border-paper/10 bg-paper/[0.055] px-3 py-3"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-paper/42">
              {row.label}
            </div>
            <div className="mt-1 font-mono text-[12px] text-paper/86">
              {row.value}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-4 text-[12px] leading-relaxed text-paper/52">
        This panel stays quiet until the source returns measured values. The app
        does not draw illustrative charts or substitute stale levels here.
      </p>
    </div>
  );
}
