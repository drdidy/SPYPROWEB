"use client";
import { Card } from "@/components/ui/Card";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import type { DecisionState, SignalQuality, TradeSignal } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

const verdictTone = {
  WAIT: "text-gold-ink",
  LONG: "text-bull-ink",
  SHORT: "text-bear-ink",
  "STAND DOWN": "text-ink-3",
} as const;

const finalToVariant = {
  TRADE_ALLOWED: "confirmed",
  WAIT_FOR_CONFIRMATION: "watching",
  WAIT_FOR_RETEST: "watching",
  SELECTIVE_TRADE: "watching",
  NO_TRADE: "stale",
  STOP_TRADING: "breached",
} as const;

export function DecisionSlate({
  decision,
  signal,
  quality,
}: {
  decision: DecisionState;
  signal: TradeSignal;
  quality: SignalQuality;
}) {
  const Icon =
    decision.verdict === "LONG"
      ? ArrowUpRight
      : decision.verdict === "SHORT"
        ? ArrowDownRight
        : Minus;

  return (
    <Card className="relative overflow-hidden">
      {/* corner cross-rule decoration */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rule to-transparent" />
      <div className="grid grid-cols-12 gap-0">
        {/* LEFT — verdict block */}
        <div className="col-span-12 lg:col-span-7 p-7 pr-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">Decision Slate</span>
              <span className="text-[10px] text-ink-4 font-mono">
                {decision.windowET} · updated {decision.updatedAt}
              </span>
            </div>
            <StatusPill variant={finalToVariant[decision.finalDecision]} pulse>
              {decision.finalDecision.replace(/_/g, " ")}
            </StatusPill>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <Icon
              className={`${verdictTone[decision.verdict]} -mb-3`}
              size={44}
              strokeWidth={1.25}
            />
            <AnimatePresence mode="wait">
              <motion.h1
                key={decision.verdict}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                className={`text-verdict font-serif tracking-tight ${verdictTone[decision.verdict]}`}
              >
                {decision.verdict}
              </motion.h1>
            </AnimatePresence>
          </div>

          {/* conviction bar */}
          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="eyebrow text-ink-3">Conviction</span>
              <span className="font-mono text-sm text-ink tabular-nums">
                <span className="font-semibold">{decision.conviction}</span>
                <span className="text-ink-4">/100</span>
              </span>
            </div>
            <div className="relative h-1 bg-paper-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${decision.conviction}%` }}
                transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute inset-y-0 left-0 bg-ink rounded-full"
              />
              {/* threshold ticks */}
              {[40, 60, 80].map((t) => (
                <span
                  key={t}
                  className="absolute top-0 h-full w-px bg-paper"
                  style={{ left: `${t}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-ink-4 tabular-nums">
              <span>0 NO</span>
              <span>40 D</span>
              <span>60 C</span>
              <span>80 B/A</span>
              <span>100</span>
            </div>
          </div>

          <p className="mt-7 text-[15px] text-ink-2 leading-relaxed max-w-xl">
            {decision.finalExplanation}
          </p>
        </div>

        {/* vertical rule */}
        <div className="hidden lg:block absolute left-[58.333%] top-7 bottom-7 w-px bg-rule" />

        {/* RIGHT — signal anatomy */}
        <div className="col-span-12 lg:col-span-5 p-7 pl-7 bg-paper-2/40">
          <div className="flex items-start justify-between">
            <div>
              <span className="eyebrow text-ink-3">Latest Signal</span>
              <div className="mt-2 flex items-center gap-3">
                <GradeBadge grade={quality.grade} size="lg" />
                <div>
                  <div className="text-xs font-mono text-ink-3">
                    {signal.type} · {signal.lineName}
                  </div>
                  <div className="text-title font-serif text-ink mt-0.5">
                    Score {quality.score}
                  </div>
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] text-ink-4">{signal.id}</span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-3">
            <Stat label="Entry" value={signal.entryPrice.toFixed(2)} />
            <Stat label="Stop" value={signal.stopPrice.toFixed(2)} tone="bear" />
            <Stat label="Target" value={signal.targetPrice.toFixed(2)} tone="bull" />
            <Stat label="R:R" value={`1 : ${signal.rr.toFixed(1)}`} />
            <Stat label="Risk" value={`$${(signal.entryPrice - signal.stopPrice).toFixed(2)}`} />
            <Stat label="Reward" value={`$${(signal.targetPrice - signal.entryPrice).toFixed(2)}`} />
          </div>

          <div className="mt-6 hr-rule" />

          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
            <Mini label="Close dist" value={`$${quality.closeDistance.toFixed(2)}`} />
            <Mini label="Wick reject" value={quality.wickRejectionRatio.toFixed(2)} />
            <Mini label="Body pos" value={quality.bodyPositionScore.toFixed(2)} />
            <Mini label="Target qual" value={quality.targetQuality.toFixed(2)} />
          </div>

          {quality.warnings.length > 0 && (
            <div className="mt-4 px-3 py-2 rounded-soft bg-gold-tint shadow-rule">
              <div className="eyebrow text-gold-ink mb-1">Warnings</div>
              <ul className="text-[11px] text-gold-ink/90 space-y-0.5">
                {quality.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <span className="text-gold-ink/60">·</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls = tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className={`font-mono text-sm font-semibold tabular-nums ${cls}`} data-num>
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between leader pb-0.5">
      <span className="text-ink-3">{label}</span>
      <span className="font-mono text-ink tabular-nums" data-num>
        {value}
      </span>
    </div>
  );
}
