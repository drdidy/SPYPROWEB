import { ArrowRight } from "lucide-react";
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
    <div className="bg-carbon text-white">
      <header className="grid border-b border-white/20 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="px-5 py-10 md:px-10 md:py-14">
          <p className="microlabel text-lime">Market atlas</p>
          <h1 className="mt-6 max-w-[1050px] text-[13vw] font-black leading-[0.86] tracking-[-0.015em] sm:text-[50px] md:text-[72px] xl:text-[96px]">
            Structure without the chart clutter.
          </h1>
          <p className="mt-7 max-w-[720px] text-[15px] leading-relaxed text-white/60">
            Diagonal shelves define the larger corridor. Horizontal rails
            define the next intraday decision. Neither one is an entry by
            itself.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="group m-5 inline-flex h-12 items-center justify-center gap-3 bg-lime px-5 text-[11px] font-black uppercase tracking-[0.1em] text-carbon transition-colors hover:bg-white lg:m-10"
        >
          Return to Today
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </header>

      <section className="grid lg:grid-cols-2">
        <AtlasInstrument
          symbol="SPY"
          subtitle="Intraday rails"
          source={spySource}
          price={spyValid ? spy.currentPrice : Number.NaN}
          levels={spyLevels}
          decay="0.12 / trading hour"
          spacing="3.4 points"
        />
        <AtlasInstrument
          symbol="ES / SPX"
          subtitle="Lead-market shelves"
          source={spxSource}
          price={spxValid ? spx.price.last : Number.NaN}
          levels={esLevels}
          decay="1.04 / trading hour"
          spacing="34 points"
          className="border-t border-white/20 lg:border-l lg:border-t-0"
        />
      </section>

      <section className="grid border-t border-white/20 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-optic p-5 py-12 text-carbon md:p-10">
          <p className="microlabel text-cobalt">Confluence rule</p>
          <h2 className="mt-6 max-w-[820px] text-[36px] font-black leading-[0.92] tracking-[-0.01em] md:text-[52px] xl:text-[64px]">
            A beautiful setup with no room is still a bad trade.
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
        <div className="bg-coral p-5 py-12 text-carbon md:p-10">
          <p className="microlabel">Map discipline</p>
          <ol className="mt-8 border-t border-carbon">
            <Rule
              number="01"
              title="Touch is context"
              body="The Engine still has to confirm."
            />
            <Rule
              number="02"
              title="Break changes role"
              body="Resistance can become support and support can become resistance."
            />
            <Rule
              number="03"
              title="Target needs room"
              body="A nearby shelf can invalidate an otherwise clean reward plan."
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
  decay,
  spacing,
  className = "",
}: {
  symbol: string;
  subtitle: string;
  source: string;
  price: number;
  levels: AtlasLevel[];
  decay: string;
  spacing: string;
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
                  The field remains empty instead of drawing sample rails.
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
                    <span aria-hidden="true" className="text-[10px] text-white/40">
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

      <div className="border-t border-white/20">
        <p className="microlabel px-5 pt-4 text-white/60">
          Rail model constants / configuration, not live data
        </p>
        <div className="grid grid-cols-2">
          <AtlasMetric label="Decay" value={decay} />
          <AtlasMetric label="Spacing" value={spacing} />
        </div>
      </div>
    </article>
  );
}

function AtlasMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-white/20 p-5 pt-3 last:border-r-0">
      <p className="microlabel text-white/60">{label}</p>
      <p className="num mt-2 text-[12px] font-black">{value}</p>
    </div>
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
      <p className="microlabel text-carbon/60">{symbol} nearest decision</p>
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
    <li className="grid grid-cols-[44px_1fr] border-b border-carbon py-5">
      <span className="font-mono text-[10px] font-bold">{number}</span>
      <div>
        <p className="text-[14px] font-black">{title}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-carbon/75">
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
