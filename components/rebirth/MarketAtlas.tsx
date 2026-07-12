import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { SPXLine, SPXSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

type AtlasLevel = {
  label: string;
  value: number;
  distance: number;
  direction: string;
  primary: boolean;
};

export function MarketAtlas({
  spy,
  spx,
  spySource,
  spxSource,
}: {
  spy: AdaptedSnapshot;
  spx: SPXSnapshot;
  spySource: string;
  spxSource: string;
}) {
  const spyValid = usable(spySource);
  const spxValid = usable(spxSource);
  const spyLevels = spyValid
    ? spy.lines
        .filter((line) => Number.isFinite(line.currentValue))
        .map((line) => ({
          label: line.name,
          value: line.currentValue,
          distance: Math.abs(line.currentValue - spy.currentPrice),
          direction: line.direction,
          primary: line.isPrimary,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 7)
    : [];
  const esLevels = spxValid
    ? spx.lines
        .filter((line: SPXLine) => Number.isFinite(line.currentValue))
        .map((line: SPXLine) => ({
          label: line.name,
          value: line.currentValue,
          distance: Math.abs(line.currentValue - spx.price.last),
          direction: line.kind,
          primary: spx.rthBias?.referenceLine === line.kind,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 7)
    : [];

  return (
    <div className="workspace-canvas text-white">
      <header className="workspace-intro grid lg:grid-cols-[1fr_auto] lg:items-end">
        <Image src="/images/market-duality-hall-v1.png" alt="" fill className="object-cover object-center opacity-20" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon via-carbon/90 to-carbon/45" />
        <div className="relative z-10 px-5 py-10 md:px-10 md:py-12">
          <p className="microlabel text-mineral">Private market map</p>
          <h1 className="workspace-title mt-5">
            See the levels that matter now.
          </h1>
          <p className="workspace-copy mt-5">
            Compare current price with the nearest verified support and
            resistance. Check the distance to each level before taking a trade.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="workspace-button relative z-10 m-5 lg:m-10"
        >
          Return to Today
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </header>

      <section className="grid bg-[#0c1114] lg:grid-cols-2">
        <AtlasInstrument
          symbol="SPY"
          subtitle="Intraday levels"
          source={spySource}
          price={spyValid ? spy.currentPrice : Number.NaN}
          levels={spyLevels}
        />
        <AtlasInstrument
          symbol="ES / SPX"
          subtitle="ES and SPX levels"
          source={spxSource}
          price={spxValid ? spx.price.last : Number.NaN}
          levels={esLevels}
          className="border-t border-white/20 lg:border-l lg:border-t-0"
        />
      </section>

      <section className="grid border-t border-white/10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="workspace-surface p-5 py-11 md:p-10">
          <p className="microlabel text-cobalt">Room to target</p>
          <h2 className="mt-5 max-w-[760px] text-[34px] font-black leading-[0.96] tracking-normal md:text-[46px]">
            Skip the trade when the next level blocks the target.
          </h2>
          <div className="mt-10 grid border-t border-carbon sm:grid-cols-2">
            <RoomRead symbol="SPY" level={spyLevels[0] ?? null} />
            <RoomRead
              symbol="ES / SPX"
              level={esLevels[0] ?? null}
              className="border-t border-carbon/20 sm:border-l sm:border-t-0"
            />
          </div>
        </div>
        <div className="bg-[#11191c] p-5 py-11 text-white md:p-10">
          <p className="microlabel text-mineral">How to use the map</p>
          <ol className="mt-8 border-t border-white/20">
            <Rule
              number="01"
              title="A touch is not an entry"
              body="Wait for the Engine confirmation before entering."
            />
            <Rule
              number="02"
              title="Break changes role"
              body="Resistance can become support and support can become resistance."
            />
            <Rule
              number="03"
              title="Target needs room"
              body="A nearby mapped level can block an otherwise valid target."
            />
          </ol>
        </div>
      </section>
    </div>
  );
}

function AtlasInstrument({
  symbol,
  subtitle,
  source,
  price,
  levels,
  className = "",
}: {
  symbol: string;
  subtitle: string;
  source: string;
  price: number;
  levels: AtlasLevel[];
  className?: string;
}) {
  const valid = usable(source);
  return (
    <article className={className}>
      <div className="flex items-start justify-between gap-4 border-b border-white/20 p-5 md:p-8">
        <div>
          <p className="microlabel text-lime">{symbol}</p>
          <h2 className="mt-3 text-[26px] font-black md:text-[28px]">
            {subtitle}
          </h2>
        </div>
        <span
          className={cn(
            "microlabel border px-2.5 py-1.5",
            valid
              ? "border-white/35 text-white/80"
              : "border-coral/70 text-coral",
          )}
        >
          Source / {source}
        </span>
      </div>

      <div className="grid md:grid-cols-[1fr_218px]">
        <div className="hud-grid relative h-[440px] overflow-hidden md:h-[520px]">
          {levels.length ? (
            levels.slice(0, 6).map((level, index) => (
              <div
                key={`${level.label}-${level.value}`}
                className="absolute -left-[8%] -right-[8%] h-px origin-center"
                style={{
                  top: 60 + index * 76,
                  background: level.primary
                    ? "#B8F23D"
                    : "rgba(255,255,255,0.42)",
                  transform: level.direction.toUpperCase().includes("DESC")
                    ? "rotate(3deg)"
                    : level.direction.toUpperCase().includes("ASC")
                      ? "rotate(-3deg)"
                      : "none",
                }}
              >
                <span
                  className={cn(
                    "microlabel absolute right-[10%] -top-3.5 bg-carbon px-2 py-0.5",
                    level.primary ? "text-lime" : "text-white/60",
                  )}
                >
                  {level.label} /{" "}
                  <span className="num">{format(level.value)}</span>
                </span>
              </div>
            ))
          ) : (
            <div className="hatch absolute inset-0 grid place-items-center p-8 text-center">
              <div>
                <span
                  className="mx-auto grid h-10 w-10 place-items-center border border-white/25"
                  aria-hidden="true"
                >
                  <span className="h-1.5 w-1.5 animate-blink bg-coral" />
                </span>
                <p className="mt-5 text-[22px] font-black">
                  Verified geometry unavailable
                </p>
                <p className="mt-2 text-[12px] text-white/60">
                  The field remains empty instead of inventing sample levels.
                </p>
              </div>
            </div>
          )}
          {Number.isFinite(price) && (
            <div className="absolute inset-x-0 top-1/2 flex items-center">
              <span className="h-[2px] flex-1 bg-cobalt" />
              <span className="num bg-cobalt px-3 py-2 text-[11px] font-black text-white">
                NOW {format(price)}
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-white/20 md:border-l md:border-t-0">
          <p className="microlabel border-b border-white/20 px-4 py-3 text-white/60">
            Level ladder / by distance
          </p>
          {levels.length ? (
            <ol>
              {levels.slice(0, 6).map((level, index) => (
                <li
                  key={`ladder-${level.label}-${level.value}`}
                  className={cn(
                    "border-b border-white/10 px-4 py-3",
                    level.primary && "bg-lime/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "microlabel",
                        level.primary ? "text-lime" : "text-white/60",
                      )}
                    >
                      {index + 1} · {level.label}
                    </span>
                    <span aria-hidden="true" className="text-[10px] text-white/65">
                      {level.direction.toUpperCase().includes("DESC")
                        ? "↘"
                        : level.direction.toUpperCase().includes("ASC")
                          ? "↗"
                          : "→"}
                    </span>
                  </div>
                  <div className="num mt-1.5 flex items-baseline justify-between text-[12px]">
                    <span className="font-bold text-white/85">
                      {format(level.value)}
                    </span>
                    <span className="text-white/65">
                      {level.distance.toFixed(2)} away
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-6 text-[12px] leading-relaxed text-white/65">
              The ladder fills only with verified levels.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-white/20 px-5 py-4">
        <p className="microlabel text-white/65">
          Protected model / verified outputs only
        </p>
      </div>
    </article>
  );
}

function RoomRead({
  symbol,
  level,
  className = "",
}: {
  symbol: string;
  level: AtlasLevel | null;
  className?: string;
}) {
  return (
    <div className={`py-7 sm:px-7 sm:first:pl-0 ${className}`}>
      <p className="microlabel text-carbon/60">{symbol} nearest level</p>
      <p className="mt-4 text-[26px] font-black md:text-[28px]">
        {level?.label ?? "Waiting"}
      </p>
      <p className="num mt-2 text-[12px] text-carbon/60">
        {level
          ? `${format(level.value)} / ${level.distance.toFixed(2)} points away`
          : "No verified level available."}
      </p>
    </div>
  );
}

function Rule({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <li className="grid grid-cols-[44px_1fr] border-b border-white/20 py-5">
      <span className="font-mono text-[10px] font-bold text-mineral">{number}</span>
      <div>
        <p className="text-[14px] font-black">{title}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-white/60">
          {body}
        </p>
      </div>
    </li>
  );
}

function usable(source: string) {
  return source === "live" || source === "degraded";
}
function format(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
