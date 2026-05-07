"use client";
// Landing — editorial entry gate from 81ed613d* in the design bundle.
// Renders the brand mark, manifesto, principles, today's bias dial,
// SPY live tile, armed trigger callout, and upcoming events ticker.
// Reads from /api/snapshot so the live state is real, not mocked.
import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";

interface LandingProps {
  snap: Snapshot | null;
  err: string | null;
  onEnter: () => void;
}

const PRINCIPLES = [
  { n: "I",   h: "STRUCTURE", body: "The chart is read against pivots, supply, dealer gamma, and term structure — never in isolation. Bias precedes verb." },
  { n: "II",  h: "DECISION",  body: "A single verb at any moment — LONG, SHORT, WAIT, HOLD, EXIT — earned by quality and never granted by hope." },
  { n: "III", h: "EXECUTION", body: "Triggers arm before they fire. Size scales to setup quality. Every call is logged, timestamped, and replayable." },
];

const UPCOMING = [
  { time: "14:00", code: "FOMC",     label: "Rate Decision",  impact: "HIGH" },
  { time: "14:30", code: "POWELL",   label: "Press Conf.",    impact: "HIGH" },
  { time: "16:00", code: "CASH CLS", label: "NYSE Close",     impact: "PROC" },
];

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function Landing({ snap, err, onEnter }: LandingProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Allow keyboard Enter to enter the cockpit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnter]);

  const fmtClock = now.toLocaleTimeString("en-US", { hour12: false }).slice(0, 8);
  const fmtDate = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  // Bias dial geometry: -100 (full short) → +100 (full long); ±90° sweep.
  const biasScore = snap?.bias.score ?? 0;
  const biasLabel = snap?.bias.label ?? "LOADING";
  const biasNote = snap?.bias.note ?? "";
  const biasDeg = Math.max(-90, Math.min(90, (biasScore / 100) * 90));
  const biasColor = biasScore >= 50 ? "var(--green)" : biasScore <= -50 ? "var(--red)" : biasScore >= 15 ? "var(--green)" : biasScore <= -15 ? "var(--red)" : "var(--amber)";

  const quote = snap?.quote;
  const ctx = snap?.context;
  const spark = snap?.spark ?? [];

  const sparkPath = (() => {
    if (spark.length < 2) return "";
    const sMin = Math.min(...spark) - 0.05;
    const sMax = Math.max(...spark) + 0.05;
    const range = sMax - sMin || 1;
    return spark
      .map((v, i) => {
        const x = (i / (spark.length - 1)) * 600;
        const y = 80 - ((v - sMin) / range) * 70;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  })();
  const sMin = spark.length ? Math.min(...spark) - 0.05 : 0;
  const sMax = spark.length ? Math.max(...spark) + 0.05 : 1;

  const armedTrigger = snap?.triggers.find((t) => t.status === "ARMED") ?? null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--surface)",
      color: "var(--text-primary)",
      display: "flex", flexDirection: "column",
      animation: "pageIn 600ms cubic-bezier(0.16, 1, 0.3, 1)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Top status bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 40px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--surface-elev)",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot price-pulse" style={{ background: "var(--green)" }}/>
            <span className="t-caption c-secondary" style={{ letterSpacing: "0.16em", fontWeight: 600 }}>NYSE OPEN</span>
          </div>
          <div style={{ width: 1, height: 14, background: "var(--border-emphasis)" }}/>
          <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>SOURCE · {(snap?.source ?? "loading").toUpperCase()}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>{fmtDate}</span>
          <div style={{
            fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13,
            color: "var(--text-primary)", letterSpacing: "0.04em",
            padding: "4px 10px",
            background: "var(--surface-pressed)",
            border: "1px solid var(--border-subtle)",
          }}>{fmtClock} ET</div>
        </div>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1.05fr 1fr",
        position: "relative", zIndex: 1,
      }}>
        {/* LEFT — brand + manifesto */}
        <div style={{
          padding: "80px 72px 56px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          borderRight: "1px solid var(--border-subtle)",
          minHeight: 0,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
              <div style={{ width: 24, height: 1, background: "var(--amber)" }}/>
              <span className="t-caption c-amber" style={{ letterSpacing: "0.24em", fontWeight: 600 }}>
                DECISION INSTRUMENT · v0.1
              </span>
            </div>

            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 44, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 8 }}>
              SPY/<span style={{ color: "var(--amber)" }}>PROPHET</span>
            </div>
            <div className="t-label c-tertiary">Trading terminal for the SPY structure-driven trader</div>

            <h1 style={{
              fontFamily: "var(--font-mono)", fontWeight: 700,
              fontSize: "clamp(40px, 4.6vw, 64px)",
              letterSpacing: "-0.035em",
              lineHeight: 1.02,
              margin: "56px 0 0",
              color: "var(--text-primary)",
              maxWidth: 720,
            }}>
              Read structure.<br/>
              Arm the trigger.<br/>
              <span style={{ color: "var(--amber)" }}>Earn the verb.</span>
            </h1>

            <p style={{
              maxWidth: 560, marginTop: 32,
              fontSize: 17, lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}>
              SPY/Prophet is not a signal feed. It is a discipline — a private cockpit that reads the same SPY every other screen does, but holds you to the rules you wrote when the market wasn't shouting.
            </p>

            <div style={{ marginTop: 48, display: "flex", gap: 12, alignItems: "center" }}>
              <button className="btn btn-primary" onClick={onEnter} style={{
                padding: "16px 26px", height: 48, fontSize: 13, letterSpacing: "0.16em", fontWeight: 600,
              }}>ENTER COCKPIT →</button>
              <button className="btn btn-ghost" onClick={onEnter} style={{
                padding: "16px 22px", height: 48, fontSize: 13, letterSpacing: "0.16em", fontWeight: 600,
              }}>READ TODAY&apos;S BRIEF</button>
              <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em", marginLeft: 8 }}>⏎ ENTER</span>
            </div>
          </div>

          <div style={{
            marginTop: 80,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 0,
            borderTop: "1px solid var(--border-subtle)",
          }}>
            {PRINCIPLES.map((p, i) => (
              <div key={p.n} style={{
                padding: "28px 32px 0 0",
                paddingLeft: i === 0 ? 0 : 32,
                borderLeft: i === 0 ? "none" : "1px solid var(--border-subtle)",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontWeight: 700,
                  fontSize: 32, color: "var(--amber)",
                  letterSpacing: "-0.02em", lineHeight: 1,
                  marginBottom: 12,
                }}>{p.n}</div>
                <div className="t-caption c-primary" style={{
                  letterSpacing: "0.18em", fontWeight: 700, marginBottom: 8,
                }}>{p.h}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>{p.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — live state */}
        <div style={{
          padding: "72px 56px 56px",
          display: "flex", flexDirection: "column", gap: 36,
          background: "var(--surface-elev)",
          minHeight: 0,
        }}>
          {err && <div className="t-body c-amber">Could not load /api/snapshot: {err}</div>}

          {/* Bias dial */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span className="t-label c-tertiary">TODAY&apos;S BIAS</span>
              <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>
                SCORE {biasScore > 0 ? "+" : ""}{biasScore}/100
              </span>
            </div>
            <div style={{ position: "relative", height: 148, display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <svg width="280" height="148" viewBox="0 0 280 148" style={{ overflow: "visible" }}>
                <path d="M 30 130 A 110 110 0 0 1 250 130" fill="none" stroke="var(--border-subtle)" strokeWidth="2"/>
                <defs>
                  <linearGradient id="biasGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--red)"/>
                    <stop offset="50%" stopColor="var(--amber)"/>
                    <stop offset="100%" stopColor="var(--green)"/>
                  </linearGradient>
                </defs>
                {[-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90].map((deg, i) => {
                  const a = ((deg - 90) * Math.PI) / 180;
                  const x1 = 140 + Math.cos(a) * 110;
                  const y1 = 130 + Math.sin(a) * 110;
                  const x2 = 140 + Math.cos(a) * (deg % 45 === 0 ? 100 : 104);
                  const y2 = 130 + Math.sin(a) * (deg % 45 === 0 ? 100 : 104);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-tertiary)" strokeWidth={deg % 45 === 0 ? 1.4 : 0.8}/>;
                })}
                <g style={{ transformOrigin: "140px 130px", transform: `rotate(${biasDeg}deg)`, transition: "transform 800ms cubic-bezier(0.16,1,0.3,1)" }}>
                  <line x1="140" y1="130" x2="140" y2="28" stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round"/>
                  <polygon points="140,22 134,32 146,32" fill="var(--text-primary)"/>
                </g>
                <circle cx="140" cy="130" r="6" fill="var(--surface)" stroke="var(--text-primary)" strokeWidth="2"/>
                <text x="22" y="146" fontFamily="var(--font-mono)" fontWeight="700" fontSize="10" fill="var(--red)" letterSpacing="0.1em">SHORT</text>
                <text x="258" y="146" textAnchor="end" fontFamily="var(--font-mono)" fontWeight="700" fontSize="10" fill="var(--green)" letterSpacing="0.1em">LONG</text>
              </svg>
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontWeight: 700,
              fontSize: 32, color: biasColor,
              letterSpacing: "-0.02em", textAlign: "center",
            }}>{biasLabel}</div>
            <div className="t-caption c-tertiary" style={{ textAlign: "center", marginTop: 6, letterSpacing: "0.14em" }}>
              {biasNote}
            </div>
          </div>

          {/* SPY live + sparkline */}
          {quote && (
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              padding: "24px 28px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
                <div>
                  <div className="t-label c-tertiary" style={{ marginBottom: 8 }}>SPY · LIVE · 1D</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      fontSize: 48, letterSpacing: "-0.03em", lineHeight: 1,
                      color: "var(--text-primary)",
                    }}>{fmt(quote.last)}</div>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontWeight: 600,
                      color: quote.chg >= 0 ? "var(--green)" : "var(--red)",
                      fontSize: 15,
                    }}>
                      {quote.chg >= 0 ? "+" : ""}{fmt(quote.chg)} ({quote.chgPct >= 0 ? "+" : ""}{fmt(quote.chgPct, 3)}%)
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="t-caption c-tertiary" style={{ letterSpacing: "0.12em", marginBottom: 4 }}>RANGE</div>
                  <div className="t-body-num c-primary" style={{ fontSize: 13 }}>{fmt(quote.low)}–{fmt(quote.high)}</div>
                </div>
              </div>
              {sparkPath && (
                <svg viewBox="0 0 600 90" width="100%" height="60" style={{ display: "block", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={quote.chg >= 0 ? "var(--green)" : "var(--red)"} stopOpacity="0.18"/>
                      <stop offset="100%" stopColor={quote.chg >= 0 ? "var(--green)" : "var(--red)"} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <path d={`${sparkPath} L 600 90 L 0 90 Z`} fill="url(#sparkFill)"/>
                  <path d={sparkPath} fill="none" stroke={quote.chg >= 0 ? "var(--green)" : "var(--red)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  {spark.length > 0 && (
                    <circle cx="600" cy={90 - ((spark[spark.length - 1] - sMin) / Math.max(0.0001, sMax - sMin)) * 70} r="3.5" fill={quote.chg >= 0 ? "var(--green)" : "var(--red)"}>
                      <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite"/>
                    </circle>
                  )}
                </svg>
              )}
              {ctx && (
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 1, marginTop: 18,
                  background: "var(--border-subtle)",
                  border: "1px solid var(--border-subtle)",
                }}>
                  {[
                    { l: "OPEN", v: fmt(quote.open) },
                    { l: "PREV", v: fmt(quote.prevClose) },
                    { l: "VIX",  v: fmt(ctx.vix) },
                    { l: "DXY",  v: fmt(ctx.dxy) },
                  ].map((s) => (
                    <div key={s.l} style={{ background: "var(--surface)", padding: "10px 12px" }}>
                      <div className="t-caption c-tertiary" style={{ fontSize: 9, letterSpacing: "0.14em" }}>{s.l}</div>
                      <div className="t-body-num c-primary" style={{ fontSize: 14, fontWeight: 600 }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Armed trigger callout */}
          {armedTrigger && (
            <div style={{
              border: "1px solid var(--amber)",
              background: "rgba(245, 182, 66, 0.04)",
              padding: "18px 22px",
              display: "flex", alignItems: "center", gap: 18,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: 0, background: "var(--amber)",
                animation: "pricePulse 1.6s ease-in-out infinite",
              }}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span className="t-caption c-amber" style={{ letterSpacing: "0.18em", fontWeight: 700 }}>TRIGGER ARMED</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.12em" }}>
                    {armedTrigger.line.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {fmt(armedTrigger.level)} <span style={{ color: "var(--text-tertiary)" }}>· bias {armedTrigger.bias > 0 ? "+" : ""}{armedTrigger.bias}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>
                  DIST {armedTrigger.dist > 0 ? "+" : ""}{fmt(armedTrigger.dist)}
                </div>
                <div className="t-caption c-amber" style={{ letterSpacing: "0.12em", marginTop: 2 }}>FIRES ON BREAK</div>
              </div>
            </div>
          )}

          {/* Upcoming events */}
          <div>
            <div className="t-label c-tertiary" style={{ marginBottom: 12 }}>UPCOMING · NEXT 3 EVENTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--border-subtle)", border: "1px solid var(--border-subtle)" }}>
              {UPCOMING.map((e) => (
                <div key={e.code} style={{
                  background: "var(--surface)",
                  padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)", minWidth: 50 }}>{e.time}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.1em", minWidth: 74 }}>{e.code}</div>
                  <div style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)" }}>{e.label}</div>
                  <span className={`pill ${e.impact === "HIGH" ? "pill-red" : "pill-neutral"}`}>{e.impact}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 40px",
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--surface-elev)",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span className="t-caption c-tertiary" style={{ letterSpacing: "0.16em", fontWeight: 600 }}>SPY/PROPHET</span>
          <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>v0.2 · BUILD 2410.04</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span className="t-caption c-tertiary" style={{ letterSpacing: "0.16em" }}>NO ADVICE · INSTRUMENT ONLY</span>
        </div>
      </div>
    </div>
  );
}
