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
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
        <ScopeGraphic />
      </div>
    </div>
  );
}

function ScopeGraphic() {
  const ticks = [18, 36, 54, 72, 90];
  return (
    <div className="relative min-h-[220px] hidden lg:block">
      <div className="absolute inset-0 rounded-card border border-paper/10 bg-paper/[0.035]" />
      <svg
        viewBox="0 0 360 220"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Awaiting data graphic"
      >
        <defs>
          <linearGradient id="scopeGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F4E4C0" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#B8821F" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <rect x="30" y="26" width="300" height="168" rx="8" fill="none" stroke="rgba(255,255,255,0.12)" />
        {ticks.map((x) => (
          <line
            key={x}
            x1={30 + x * 3}
            x2={30 + x * 3}
            y1="26"
            y2="194"
            stroke="rgba(255,255,255,0.07)"
          />
        ))}
        {[48, 82, 116, 150].map((y) => (
          <line
            key={y}
            x1="30"
            x2="330"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.07)"
          />
        ))}
        <path
          d="M44 154 C 86 118, 112 132, 148 98 S 220 74, 254 104 S 300 139, 318 88"
          fill="none"
          stroke="url(#scopeGold)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M44 156 L318 90"
          fill="none"
          stroke="rgba(244,228,192,0.28)"
          strokeWidth="1.5"
          strokeDasharray="7 8"
        />
        <circle cx="254" cy="104" r="4" fill="#F4E4C0" />
        <circle cx="254" cy="104" r="13" fill="none" stroke="rgba(244,228,192,0.28)" />
        <text x="45" y="48" fill="rgba(255,255,255,0.46)" fontSize="9" fontFamily="monospace">
          DATA LINK
        </text>
        <text x="249" y="178" fill="rgba(244,228,192,0.72)" fontSize="9" fontFamily="monospace">
          STANDBY
        </text>
      </svg>
    </div>
  );
}
