"use client";
// Market Context — live macro tiles from snap.marketContext, with the
// news + economic calendar still on a stub feed (no provider wired yet).
import { useMemo } from "react";
import type { MarketContext as MarketContextData, MarketTone, Snapshot } from "@/lib/types";
import { PageHeader } from "../page-header";

const NEWS = [
  { ts: "11:42 CT", source: "WSJ",     impact: "HIGH", tag: "FED",   headline: "Powell signals patience on rate path; markets read dovish tilt into year-end", sentiment: "bull" },
  { ts: "11:18 CT", source: "BBG",     impact: "MED",  tag: "TECH",  headline: "NVDA-led semiconductor strength lifts QQQ; SPY tracks with 0.4% gain pre-lunch", sentiment: "bull" },
  { ts: "10:54 CT", source: "REUTERS", impact: "MED",  tag: "MACRO", headline: "10Y yield fades from session high after weaker-than-expected services PMI print", sentiment: "bull" },
  { ts: "10:31 CT", source: "CNBC",    impact: "LOW",  tag: "EARN",  headline: "Retail bellwether guides cautiously into holiday quarter; sector breadth narrows", sentiment: "bear" },
  { ts: "09:48 CT", source: "WSJ",     impact: "HIGH", tag: "GEO",   headline: "Middle East tensions ease on diplomatic progress; oil drops 1.8%, risk-on rotation", sentiment: "bull" },
  { ts: "09:12 CT", source: "BBG",     impact: "MED",  tag: "FLOW",  headline: "Pension rebalancing flow estimated at $14B equity buy into month-end close", sentiment: "bull" },
  { ts: "08:30 CT", source: "GOV",     impact: "HIGH", tag: "DATA",  headline: "Initial jobless claims 218K vs 225K expected; labor market resilient", sentiment: "bull" },
] as const;

const CALENDAR = [
  { time: "07:30 CT", region: "US", event: "Initial Jobless Claims", actual: "218K", forecast: "225K", prior: "223K", impact: "HIGH" as const, status: "released" as const, surprise: "beat" as const },
  { time: "09:00 CT", region: "US", event: "ISM Services PMI",       actual: "52.4", forecast: "53.1", prior: "53.8", impact: "HIGH" as const, status: "released" as const, surprise: "miss" as const },
  { time: "13:00 CT", region: "US", event: "10Y Treasury Auction",   actual: null,   forecast: null,   prior: "4.31%", impact: "MED"  as const, status: "pending"  as const, surprise: null },
  { time: "14:00 CT", region: "US", event: "FOMC Minutes",           actual: null,   forecast: null,   prior: "—",     impact: "HIGH" as const, status: "pending"  as const, surprise: null },
  { time: "15:30 CT", region: "US", event: "Fed Williams Speaks",    actual: null,   forecast: null,   prior: "—",     impact: "MED"  as const, status: "pending"  as const, surprise: null },
  { time: "08:30 CT", region: "US", event: "CPI · TOMORROW",         actual: null,   forecast: "+0.2%", prior: "+0.4%", impact: "HIGH" as const, status: "upcoming" as const, surprise: null },
  { time: "08:30 CT", region: "US", event: "Retail Sales · FRI",     actual: null,   forecast: "+0.3%", prior: "+0.1%", impact: "MED"  as const, status: "upcoming" as const, surprise: null },
];

const SENTIMENT_COLOR = { bull: "var(--green)", bear: "var(--red)", neutral: "var(--text-tertiary)" } as const;
const IMPACT_PILL = { HIGH: "pill-red", MED: "pill-amber", LOW: "pill-outline" } as const;

const TONE_COLOR: Record<MarketTone, string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  neutral: "var(--text-secondary)",
};

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function CalRow({ c, last }: { c: typeof CALENDAR[number]; last: boolean }) {
  const surpriseColor =
    c.surprise === "beat" ? "var(--green)" :
    c.surprise === "miss" ? "var(--red)" :
    "var(--text-tertiary)";
  return (
    <div style={{
      padding: "12px 20px",
      borderBottom: last ? 0 : "1px solid var(--border-subtle)",
      display: "grid", gridTemplateColumns: "68px 1fr auto", gap: 12, alignItems: "center",
      opacity: c.status === "released" ? 0.85 : 1,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span className="t-body-num" style={{ fontSize: 13 }}>{c.time.split(" ")[0]}</span>
        <span className="t-caption c-tertiary">{c.region}</span>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className={`pill ${IMPACT_PILL[c.impact]}`} style={{ height: 18, fontSize: 10, padding: "0 6px" }}>{c.impact}</span>
          <span className="t-body c-primary" style={{ fontWeight: 500 }}>{c.event}</span>
        </div>
        {c.status === "released" ? (
          <div style={{ display: "flex", gap: 14 }}>
            <span className="t-caption"><span className="c-tertiary">A </span><span style={{ color: surpriseColor, fontWeight: 500 }}>{c.actual}</span></span>
            <span className="t-caption"><span className="c-tertiary">F </span><span className="c-secondary">{c.forecast}</span></span>
            <span className="t-caption"><span className="c-tertiary">P </span><span className="c-secondary">{c.prior}</span></span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14 }}>
            <span className="t-caption"><span className="c-tertiary">F </span><span className="c-secondary">{c.forecast || "—"}</span></span>
            <span className="t-caption"><span className="c-tertiary">P </span><span className="c-secondary">{c.prior}</span></span>
          </div>
        )}
      </div>
      <div>
        {c.status === "released" && c.surprise && (
          <span className={`pill ${c.surprise === "beat" ? "pill-green" : "pill-red"}`}>
            {c.surprise.toUpperCase()}
          </span>
        )}
        {c.status === "pending"  && <span className="pill pill-amber">NEXT</span>}
        {c.status === "upcoming" && <span className="pill pill-outline">SOON</span>}
      </div>
    </div>
  );
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

function fmtSigned(v: number | null | undefined, digits = 2, suffix = ""): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}${suffix}`;
}

function buildTiles(mc: MarketContextData | undefined) {
  const empty = { value: null, label: "—", tone: "neutral" as MarketTone, copy: "—" };
  const vix = mc?.vix ?? empty;
  const dxy = mc?.dxy ?? { value: null, chgPct: null, tone: "neutral" as MarketTone };
  const tnx = mc?.tnx ?? { value: null, chgBps: null, tone: "neutral" as MarketTone };
  const vvix = mc?.vvix ?? { value: null };
  const spy = mc?.spyPressure ?? { label: "—", tone: "neutral" as MarketTone, value: null };
  const gap = mc?.triggerGap ?? { points: null, lineName: "—", tone: "neutral" as MarketTone, label: "—" };

  return [
    {
      title: "VIX",
      metric: vix.value != null ? fmtNum(vix.value) : "—",
      sub: vix.label,
      copy: vix.copy,
      tone: vix.tone,
    },
    {
      title: "VVIX",
      metric: vvix.value != null ? fmtNum(vvix.value, 1) : "—",
      sub: "vol of vol",
      copy: "Higher VVIX = wider VIX moves",
      tone: "neutral" as MarketTone,
    },
    {
      title: "Dollar (DXY)",
      metric: dxy.value != null ? fmtNum(dxy.value) : "—",
      sub: dxy.chgPct != null ? fmtSigned(dxy.chgPct, 2, "%") : "—",
      copy: dxy.chgPct != null && dxy.chgPct > 0 ? "Strong dollar pressures equities" : "Soft dollar supports equities",
      tone: dxy.tone,
    },
    {
      title: "10Y Yield",
      metric: tnx.value != null ? `${tnx.value.toFixed(3)}%` : "—",
      sub: tnx.chgBps != null ? `${fmtSigned(tnx.chgBps, 1)} bps` : "—",
      copy: tnx.chgBps != null && tnx.chgBps > 0 ? "Yields rising; duration headwind" : "Yields easing; duration tailwind",
      tone: tnx.tone,
    },
    {
      title: "SPY Pressure",
      metric: spy.label,
      sub: spy.value != null ? fmtSigned(spy.value, 2, " pts / 3 bars") : "—",
      copy: "Direction of last three hourly closes",
      tone: spy.tone,
    },
    {
      title: "Trigger Gap",
      metric: gap.points != null ? `${fmtSigned(gap.points)} pts` : "—",
      sub: `${gap.label} · ${gap.lineName}`,
      copy: "Distance to nearest primary structure line",
      tone: gap.tone,
    },
  ];
}

export function MarketContext({ snap }: { snap?: Snapshot }) {
  const tiles = buildTiles(snap?.marketContext);

  const tilePolylines = useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: tiles.length }, (_, i) =>
      Array.from({ length: 20 }, (_, j) =>
        `${j * 10},${30 + Math.sin((i + j) * 0.6) * 15 + (rand() - 0.5) * 4}`
      ).join(" ")
    );
  }, [tiles.length]);

  return (
    <>
      <PageHeader title="Market Context" desc="Live macro readings that shape today's setup, plus market-moving headlines and the calendar."/>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 4, height: 14, background: "var(--amber)" }}/>
          <span className="t-label c-tertiary">MACRO PRIMITIVES</span>
          {snap?.source && (
            <span className="t-caption c-tertiary" style={{ marginLeft: 4 }}>· {snap.source}</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {tiles.map((t, i) => (
            <div key={t.title} className="card" style={{ padding: 16 }}>
              <div className="t-label c-tertiary">{t.title}</div>
              <div className="t-display-s" style={{ margin: "12px 0 4px", fontSize: 22, color: TONE_COLOR[t.tone] }}>{t.metric}</div>
              <div className="t-caption c-secondary">{t.sub}</div>
              <div className="t-caption c-tertiary" style={{ marginTop: 6, lineHeight: 1.4 }}>{t.copy}</div>
              <svg viewBox="0 0 200 60" style={{ width: "100%", height: 60, marginTop: 12 }}>
                <polyline
                  points={tilePolylines[i]}
                  fill="none"
                  stroke={TONE_COLOR[t.tone]}
                  strokeWidth="1"
                  opacity="0.5"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16 }}>
        <div className="card">
          <div style={{
            height: 48, display: "flex", alignItems: "center",
            padding: "0 20px", borderBottom: "1px solid var(--border-subtle)", gap: 16,
          }}>
            <span className="t-heading">NEWS · SPY-RELEVANT</span>
            <span className="t-caption c-tertiary">stub feed · provider not wired</span>
            <div style={{ flex: 1 }}/>
            <div className="tf-group">
              {["ALL", "HIGH", "MED"].map((t, i) => (
                <button key={t} className={`tf-pill ${i === 0 ? "active" : ""}`}>{t}</button>
              ))}
            </div>
          </div>
          {NEWS.map((n, i) => (
            <div key={i} style={{
              padding: "14px 20px",
              borderBottom: i === NEWS.length - 1 ? 0 : "1px solid var(--border-subtle)",
              display: "grid", gridTemplateColumns: "72px 1fr", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="t-caption c-tertiary">{n.ts}</span>
                <span className="t-caption c-secondary" style={{ letterSpacing: "0.04em" }}>{n.source}</span>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className={`pill ${IMPACT_PILL[n.impact as keyof typeof IMPACT_PILL]}`}>{n.impact}</span>
                  <span className="pill pill-outline">{n.tag}</span>
                  <span className="dot" style={{ background: SENTIMENT_COLOR[n.sentiment as keyof typeof SENTIMENT_COLOR], marginLeft: 4 }}/>
                </div>
                <p className="t-body c-primary" style={{ margin: 0, lineHeight: 1.5 }}>{n.headline}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div style={{
            height: 48, display: "flex", alignItems: "center",
            padding: "0 20px", borderBottom: "1px solid var(--border-subtle)", gap: 12,
          }}>
            <span className="t-heading">ECONOMIC CALENDAR</span>
            <div style={{ flex: 1 }}/>
            <span className="t-caption c-tertiary">CT · stub</span>
          </div>
          <div style={{ padding: "10px 20px", background: "var(--surface-pressed)", borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="t-label c-tertiary">TODAY · THU</span>
          </div>
          {CALENDAR.filter((c) => !c.event.includes("TOMORROW") && !c.event.includes("FRI")).map((c, i, arr) => (
            <CalRow key={`t${i}`} c={c} last={i === arr.length - 1}/>
          ))}
          <div style={{ padding: "10px 20px", background: "var(--surface-pressed)", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="t-label c-tertiary">UPCOMING</span>
          </div>
          {CALENDAR.filter((c) => c.event.includes("TOMORROW") || c.event.includes("FRI")).map((c, i, arr) => (
            <CalRow key={`u${i}`} c={c} last={i === arr.length - 1}/>
          ))}
        </div>
      </div>
    </>
  );
}
