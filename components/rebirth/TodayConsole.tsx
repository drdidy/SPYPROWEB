import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";

import type { ContractProjection } from "@/lib/contract-projection";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { EngineState } from "@/lib/states";
import type { SPXSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

type Level = {
  label: string;
  value: number;
  distance: number;
  direction: string;
};

type DecisionStage = "STAND_DOWN" | "WATCH" | "READY" | "ENTER" | "EXIT";

const LADDER: Array<{ stage: DecisionStage; label: string }> = [
  { stage: "STAND_DOWN", label: "Stand down" },
  { stage: "WATCH", label: "Watch" },
  { stage: "READY", label: "Ready" },
  { stage: "ENTER", label: "Enter" },
  { stage: "EXIT", label: "Exit" },
];

export function TodayConsole({
  spy,
  spx,
  spySource,
  spxSource,
  projection,
  optionsSource,
}: {
  spy: AdaptedSnapshot;
  spx: SPXSnapshot;
  spySource: string;
  spxSource: string;
  projection: ContractProjection | null;
  optionsSource: string;
}) {
  const spyUsable = usable(spySource);
  const spxUsable = usable(spxSource);
  const liveEnough = spyUsable || spxUsable;
  const state = chooseState(
    spy.currentState,
    spx.currentState ?? "STAND_DOWN",
    spyUsable,
    spxUsable,
  );
  const command = commandFor(state, liveEnough);
  const side = activeSide(spy, spx, spyUsable, spxUsable);
  const risk = activeRisk(spy, spx, spyUsable, spxUsable);
  const spyLevels = spyUsable
    ? nearest(
        spy.currentPrice,
        spy.lines.map((line) => ({
          label: line.name,
          value: line.currentValue,
          direction: line.direction,
        })),
      )
    : [];
  const esLevels = spxUsable
    ? nearest(
        spx.price.last,
        spx.lines.map((line) => ({
          label: line.name,
          value: line.currentValue,
          direction: line.kind,
        })),
      )
    : [];
  const aligned = alignment(spy, spx, spyUsable, spxUsable);
  const degraded =
    !liveEnough || spySource === "degraded" || spxSource === "degraded";

  return (
    <div>
      {/* ========================= COMMAND HEADER ======================== */}
      <section className="grid border-b border-white/10 bg-carbon text-white xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.55fr)]">
        <div className="cinematic-grid flex flex-col justify-between px-5 py-10 md:px-10 md:py-12 xl:px-14">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <SourceTag label="SPY" source={spySource} />
              <SourceTag label="ES / SPX" source={spxSource} />
              <span className="microlabel ml-1 text-white/65">
                Private desk / Chicago
              </span>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
              <p className="microlabel text-mineral">Current command</p>
              <StateLadder current={state} live={liveEnough} />
            </div>

            <h1 className="mt-5 max-w-[900px] text-[13vw] font-black leading-[0.88] tracking-normal sm:text-[48px] md:text-[62px] xl:text-[76px]">
              {command.label}
            </h1>
            <p className="mt-6 max-w-[720px] text-[15px] font-medium leading-relaxed text-white/60 md:text-[17px]">
              {command.body}
            </p>
          </div>
          <div className="mt-14 grid grid-cols-2 border-t border-white/20 sm:grid-cols-4">
            <CommandFact label="Focus" value={spxUsable ? "ES / SPX" : "SPY"} />
            <CommandFact
              label="Direction"
              value={side}
              accent={
                side === "LONG" ? "go" : side === "SHORT" ? "stop" : undefined
              }
            />
            <CommandFact
              label="Agreement"
              value={aligned ? "Aligned" : "Unconfirmed"}
            />
            <CommandFact
              label="Contract"
              value={projection ? "Available" : "Waiting"}
            />
          </div>
        </div>

        <aside className="flex flex-col border-t border-mineral/20 bg-ink p-5 text-white md:p-8 xl:border-l xl:border-t-0">
          <p className="microlabel">Proof stack</p>
          <h2 className="mt-5 max-w-[380px] text-[28px] font-black leading-[0.98] md:text-[32px]">
            A trade is only as strong as its weakest proof.
          </h2>
          <div className="mt-9 border-t border-white/20">
            <ProofRow done={liveEnough} label="Verified market source" />
            <ProofRow done={aligned} label="SPY and ES context agree" />
            <ProofRow
              done={risk.entry !== null}
              label="Entry, stop, target defined"
            />
            <ProofRow
              done={projection !== null}
              label="Live SPXW ticket selected"
            />
          </div>
          {degraded && (
            <div className="mt-auto flex gap-3 border border-coral/40 bg-coral/10 p-4 pt-4 text-[12px] font-semibold leading-relaxed">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              Stale, mock, or unavailable data can describe system health, but
              it cannot issue a trade.
            </div>
          )}
        </aside>
      </section>

      <CommandStrip label={command.label} tone={command.tone} />

      {/* ========================= STRUCTURE FIELD ======================= */}
      <section className="bg-carbon text-white">
        <div className="flex items-center justify-between gap-4 border-b border-white/15 px-5 py-4 md:px-10">
          <div>
            <p className="microlabel text-white/60">Live structure field</p>
            <h2 className="mt-1.5 text-[17px] font-black uppercase tracking-[0.02em]">
              Only the nearest decisions
            </h2>
          </div>
          <Link
            href="/map"
            className="group inline-flex h-10 shrink-0 items-center gap-2 border border-lime/60 px-4 text-[11px] font-black uppercase tracking-[0.1em] text-lime transition-colors hover:bg-lime hover:text-carbon"
          >
            Open map
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <div className="grid lg:grid-cols-2">
          <StructureField
            symbol="SPY"
            price={spyUsable ? spy.currentPrice : Number.NaN}
            state={spy.currentState}
            levels={spyLevels}
          />
          <StructureField
            symbol="ES / SPX"
            price={spxUsable ? spx.price.last : Number.NaN}
            state={spx.currentState ?? "STAND_DOWN"}
            levels={esLevels}
            className="border-t border-white/15 lg:border-l lg:border-t-0"
          />
        </div>
      </section>

      {/* ===================== TICKET / RISK / ALERTS ==================== */}
      <section className="grid border-b border-carbon xl:grid-cols-[1.1fr_0.9fr]">
        <div id="contract" className="bg-context p-5 text-white md:p-10">
          <div className="flex items-center justify-between gap-4">
            <p className="microlabel">Execution ticket</p>
            <span className="microlabel border border-white/40 px-2.5 py-1.5 text-white">
              SPXW 0DTE
            </span>
          </div>
          {projection ? (
            <LiveTicket projection={projection} />
          ) : (
            <div className="mt-12 max-w-[680px]">
              <h2 className="text-[34px] font-black leading-[0.98] md:text-[42px]">
                No contract until the setup exists.
              </h2>
              <p className="mt-5 max-w-[560px] text-[14px] leading-relaxed text-white">
                The live chain remains hidden until the engine defines a real
                SPX entry. Historical medians and invented premium estimates
                are not substituted.
              </p>
              <p className="microlabel mt-8 text-white">
                Option source / {optionsSource}
              </p>
            </div>
          )}
        </div>
        <div className="grid bg-white sm:grid-cols-2">
          <RiskBlock risk={risk} />
          <AlertBlock />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ STATE LADDER ----------------------------- */

function StateLadder({
  current,
  live,
}: {
  current: EngineState;
  live: boolean;
}) {
  const activeStage = stageFor(current, live);
  return (
    <ol
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Engine state ladder"
    >
      {LADDER.map((step) => {
        const active = step.stage === activeStage;
        return (
          <li
            key={step.stage}
            className={cn(
              "microlabel border px-2 py-1.5",
              active
                ? step.stage === "ENTER"
                  ? "border-lime bg-lime text-carbon"
                  : step.stage === "READY"
                    ? "border-mineral bg-white/[0.04] text-mineral"
                    : step.stage === "EXIT"
                      ? "border-context bg-context text-white"
                    : "border-white/40 bg-white/[0.04] text-white"
                : "border-white/25 text-white/65",
            )}
            aria-current={active ? "step" : undefined}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ COMMAND STRIP ---------------------------- */

function CommandStrip({
  label,
  tone,
}: {
  label: string;
  tone: "stop" | "go" | "ready";
}) {
  return (
    <section
      className={cn(
        "flex min-h-14 items-center justify-between gap-5 border-b border-carbon bg-carbon px-5 py-3 text-white md:px-10",
      )}
    >
      <div>
        <p className="microlabel text-white/60">Current decision</p>
        <p className={cn("mt-1 text-[16px] font-black uppercase md:text-[20px]", tone === "stop" ? "text-coral" : tone === "go" ? "text-lime" : "text-white")}>{label}</p>
      </div>
      <div className="text-right">
        <p className="microlabel text-white/60">Alert sequence</p>
        <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-lime md:text-[11px]">
          Watch / Ready / Enter / Exit
        </p>
      </div>
    </section>
  );
}

function stageFor(state: EngineState, live: boolean): DecisionStage {
  if (!live || state === "PRE_CONFIG" || state === "STAND_DOWN") return "STAND_DOWN";
  if (state === "WATCH") return "WATCH";
  if (state === "WAIT" || state === "ARMED") return "READY";
  if (state === "GO") return "ENTER";
  return "EXIT";
}

/* ---------------------------- STRUCTURE FIELDS --------------------------- */

function StructureField({
  symbol,
  price,
  state,
  levels,
  className,
}: {
  symbol: string;
  price: number;
  state: EngineState;
  levels: Level[];
  className?: string;
}) {
  return (
    <article
      className={cn("grid min-h-[380px] md:grid-cols-[200px_1fr]", className)}
    >
      <div className="border-b border-white/15 p-5 md:border-b-0 md:border-r md:p-7">
        <p className="microlabel text-lime">{symbol}</p>
        <p className="num mt-5 text-[36px] font-black">
          {Number.isFinite(price) ? format(price) : "--"}
        </p>
        <p className="microlabel mt-3 text-white/60">{humanState(state)}</p>
        {levels.length > 0 && (
          <div className="mt-8 border-t border-white/20 pt-4">
            <p className="microlabel text-white/60">Nearest</p>
            <p className="num mt-2 text-[13px] font-bold text-white/85">
              {levels[0].label}
            </p>
            <p className="num mt-1 text-[12px] text-white/70">
              {format(levels[0].value)} / {levels[0].distance.toFixed(2)} away
            </p>
          </div>
        )}
      </div>
      <div className="hud-grid relative min-h-[300px] overflow-hidden">
        {levels.length ? (
          levels.slice(0, 4).map((level, index) => (
            <div
              key={`${level.label}-${level.value}`}
              className={cn(
                "absolute -left-[5%] -right-[5%] h-px origin-center",
                index === 0 ? "bg-lime" : "bg-white/40",
              )}
              style={{
                top: 55 + index * 72,
                transform: level.direction.toUpperCase().includes("DESC")
                  ? "rotate(2.5deg)"
                  : level.direction.toUpperCase().includes("ASC")
                    ? "rotate(-2.5deg)"
                    : "none",
              }}
            >
              <span
                className={cn(
                  "microlabel absolute right-[7%] -top-3.5 bg-carbon px-2 py-0.5",
                  index === 0 ? "text-lime" : "text-white/60",
                )}
              >
                {level.label} / <span className="num">{format(level.value)}</span>
              </span>
            </div>
          ))
        ) : (
          <WaitingField />
        )}
      </div>
    </article>
  );
}

function WaitingField() {
  return (
    <div className="hatch absolute inset-0 grid place-items-center p-8 text-center">
      <div>
        <span
          className="mx-auto grid h-10 w-10 place-items-center border border-white/25"
          aria-hidden="true"
        >
          <span className="h-1.5 w-1.5 animate-blink bg-coral" />
        </span>
        <p className="mt-5 text-[20px] font-black">Awaiting verified levels</p>
        <p className="mt-2 text-[12px] text-white/60">
          No sample geometry is displayed.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- TICKET --------------------------------- */

function LiveTicket({ projection }: { projection: ContractProjection }) {
  return (
    <div className="mt-10">
      <p className="num text-[36px] font-black leading-none md:text-[44px]">
        {projection.contractLabel}
      </p>
      <div className="mt-8 grid grid-cols-2 border-y border-white/35 sm:grid-cols-4">
        <TicketMetric label="Side" value={projection.side} />
        <TicketMetric
          label="Entry"
          value={`$${projection.projectedEntry.mark.toFixed(2)}`}
        />
        <TicketMetric
          label="Target"
          value={
            projection.projectedTarget
              ? `$${projection.projectedTarget.low.toFixed(2)}-$${projection.projectedTarget.high.toFixed(2)}`
              : "--"
          }
        />
        <TicketMetric label="Confidence" value={projection.confidence} />
      </div>
      <p className="mt-6 text-[12px] leading-relaxed text-white">
        Confirm the executable bid and ask in the live chain before placing
        the order.
      </p>
    </div>
  );
}

function RiskBlock({
  risk,
}: {
  risk: { entry: number | null; stop: number | null; target: number | null };
}) {
  return (
    <div className="border-b border-carbon/15 p-5 sm:border-b-0 sm:border-r md:p-8">
      <p className="microlabel text-stop-ink">Defined risk</p>
      <h2 className="mt-7 text-[26px] font-black leading-[1.02]">
        Exit known before entry.
      </h2>
      <div className="mt-8 border-t border-carbon">
        <MetricRow
          label="Entry"
          value={risk.entry === null ? "Waiting" : format(risk.entry)}
        />
        <MetricRow
          label="Stop"
          value={risk.stop === null ? "Waiting" : format(risk.stop)}
        />
        <MetricRow
          label="Target"
          value={risk.target === null ? "Waiting" : format(risk.target)}
        />
      </div>
    </div>
  );
}

function AlertBlock() {
  return (
    <div className="p-5 md:p-8">
      <p className="microlabel text-cobalt">Phone sequence</p>
      <h2 className="mt-7 text-[26px] font-black leading-[1.02]">
        Every alert has a job.
      </h2>
      <ol className="mt-8 border-t border-carbon">
        {["Watch", "Get ready", "Enter", "Exit"].map((label, index) => (
          <li
            key={label}
            className="grid grid-cols-[36px_1fr_auto] items-center border-b border-carbon/15 py-3"
          >
            <span className="font-mono text-[10px] font-bold text-cobalt">
              0{index + 1}
            </span>
            <span className="text-[12px] font-black uppercase tracking-[0.06em]">
              {label}
            </span>
            <span
              className="h-px w-8 bg-carbon/25"
              aria-hidden="true"
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------- ATOMS ----------------------------------- */

function ProofRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-white/15 py-3">
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center border border-white/30",
          done && "border-lime bg-lime/10",
        )}
        aria-hidden="true"
      >
        {done ? (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M1.5 5.5L4.5 8.5L9.5 2.5"
              stroke="#C7FF45"
              strokeWidth="2"
            />
          </svg>
        ) : (
          <span className="h-1.5 w-1.5 bg-white/20" />
        )}
      </span>
      <span className="text-[13px] font-black">{label}</span>
      <span className="microlabel ml-auto shrink-0 text-white/65">
        {done ? "Held" : "Missing"}
      </span>
    </div>
  );
}

function CommandFact({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "go" | "stop";
}) {
  return (
    <div className="border-b border-white/15 py-4 pr-4 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
      <p className="microlabel text-white/65">{label}</p>
      <p
        className={cn(
          "mt-2.5 text-[13px] font-black",
          accent === "go" && "text-lime",
          accent === "stop" && "text-coral",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SourceTag({ label, source }: { label: string; source: string }) {
  const valid = usable(source);
  return (
    <span
      className={cn(
        "microlabel border px-2.5 py-1.5",
        valid ? "border-lime bg-lime text-carbon" : "border-coral/40 bg-coral/10 text-coral",
      )}
    >
      {label} / {source}
    </span>
  );
}

function TicketMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/35 py-4 pr-3 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
      <p className="microlabel text-white">{label}</p>
      <p className="num mt-2 text-[13px] font-black uppercase">{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-carbon/15 py-3">
      <span className="microlabel text-carbon/60">{label}</span>
      <span className="num text-[13px] font-black">{value}</span>
    </div>
  );
}

/* ------------------------------ DERIVATIONS ------------------------------ */

function nearest(
  price: number,
  levels: Array<{ label: string; value: number; direction: string }>,
): Level[] {
  return levels
    .filter((level) => Number.isFinite(level.value))
    .map((level) => ({ ...level, distance: Math.abs(level.value - price) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
}
function usable(source: string) {
  return source === "live" || source === "degraded";
}
function chooseState(
  spy: EngineState,
  spx: EngineState,
  spyUsable: boolean,
  spxUsable: boolean,
): EngineState {
  if (!spyUsable && !spxUsable) return "STAND_DOWN";
  const rank: Record<EngineState, number> = {
    PRE_CONFIG: 0,
    STAND_DOWN: 1,
    COOLDOWN: 2,
    WATCH: 3,
    WAIT: 4,
    ARMED: 5,
    GO: 6,
  };
  if (!spyUsable) return spx;
  if (!spxUsable) return spy;
  return rank[spx] > rank[spy] ? spx : spy;
}
function commandFor(state: EngineState, live: boolean) {
  if (!live)
    return {
      label: "VERIFY SOURCE",
      body: "The market feed is not trustworthy enough to open risk. Restore verified data before reading direction, levels, or contracts.",
      tone: "stop" as const,
    };
  if (state === "GO")
    return {
      label: "ENTER DEFINED",
      body: "Confirmation is complete. Execute only with the displayed stop, target, and live-chain contract.",
      tone: "go" as const,
    };
  if (state === "ARMED")
    return {
      label: "GET READY",
      body: "The structure is armed. Wait for the confirmation close. Do not anticipate it.",
      tone: "ready" as const,
    };
  if (state === "WATCH" || state === "WAIT")
    return {
      label: "WAIT FOR PROOF",
      body: "Price is near a decision, but the trade has not earned confirmation.",
      tone: "ready" as const,
    };
  if (state === "COOLDOWN")
    return {
      label: "PROTECT THE DAY",
      body: "The trade cycle is complete. Demand a fully independent setup before considering another entry.",
      tone: "go" as const,
    };
  return {
    label: "NO TRADE",
    body: "The structure does not offer a clean, defined setup. Waiting is the position.",
    tone: "stop" as const,
  };
}
function activeSide(
  spy: AdaptedSnapshot,
  spx: SPXSnapshot,
  spyUsable: boolean,
  spxUsable: boolean,
) {
  const side = spx.controlTradePlan?.activeTrade?.side;
  if (spxUsable && side === "BUY") return "LONG";
  if (spxUsable && side === "SELL") return "SHORT";
  if (spyUsable && spy.signal?.type === "CALL") return "LONG";
  if (spyUsable && spy.signal?.type === "PUT") return "SHORT";
  return "FLAT";
}
function activeRisk(
  spy: AdaptedSnapshot,
  spx: SPXSnapshot,
  spyUsable: boolean,
  spxUsable: boolean,
) {
  const trade = spx.controlTradePlan?.activeTrade;
  if (spxUsable && trade)
    return {
      entry: trade.entryPrice,
      stop: spx.invalidation?.level ?? null,
      target: trade.targetPrice,
    };
  if (spyUsable && spy.signal)
    return {
      entry: spy.signal.entryPrice,
      stop: spy.signal.stopPrice,
      target: spy.signal.targetPrice,
    };
  return { entry: null, stop: null, target: null };
}
function alignment(
  spy: AdaptedSnapshot,
  spx: SPXSnapshot,
  spyUsable: boolean,
  spxUsable: boolean,
) {
  if (!spyUsable || !spxUsable) return false;
  const spyBias = spy.bias.bias;
  const esBias = spx.rthBias?.direction;
  return (
    (spyBias === "BULLISH" && esBias === "BULLISH") ||
    (spyBias === "BEARISH" && esBias === "BEARISH")
  );
}
function humanState(state: EngineState) {
  return (
    {
      PRE_CONFIG: "Building map",
      STAND_DOWN: "Stand down",
      WATCH: "Watching",
      WAIT: "Waiting",
      ARMED: "Get ready",
      GO: "Enter",
      COOLDOWN: "Complete",
    } as const
  )[state];
}
function format(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
