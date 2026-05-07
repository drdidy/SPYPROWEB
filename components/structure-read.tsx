"use client";
// Structure Read — live, templated facts from the snapshot. No LLM, no
// fiction. Reads anchor lines, bias, market context, and signals to
// produce two short paragraphs and a one-line directive.
import type { Snapshot } from "@/lib/types";

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function fmtSigned(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}`;
}

function asOfClock(asOf: string): string {
  try {
    const d = new Date(asOf);
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/Chicago",
    });
    return `${time} CT`;
  } catch {
    return "—";
  }
}

export function StructureRead({ snap }: { snap?: Snapshot }) {
  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ width: 4, height: 18, background: "var(--amber)", borderRadius: 1 }}/>
      <span className="t-heading">STRUCTURE READ</span>
      <div style={{ flex: 1 }}/>
      <span className="t-caption c-tertiary">{snap ? `updated ${asOfClock(snap.asOf)}` : "loading"}</span>
    </div>
  );

  if (!snap) {
    return (
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        {header}
        <p className="t-body c-secondary" style={{ margin: 0 }}>Loading snapshot…</p>
      </div>
    );
  }

  const last = snap.quote.last;

  // Pull anchor / backup lines from chartLines. Primary anchors (qualified)
  // use "Anchor *"; secondary fallback (no primary today) uses "Backup *".
  const findLine = (label: string) => snap.chartLines.find((l) => l.label === label);
  const upper = findLine("Anchor Upper") ?? findLine("Backup Upper");
  const main  = findLine("Anchor Main")  ?? findLine("Backup Main");
  const lower = findLine("Anchor Lower") ?? findLine("Backup Lower");
  const a2Main = findLine("Anchor 2 Main");
  const isBackup = !!findLine("Backup Main") && !findLine("Anchor Main");
  const tier = isBackup ? "Backup" : "Anchor";
  const hasAnchor = !!main;

  let p1 = "";
  if (hasAnchor && main) {
    const dist = last - main.value;
    const side = dist >= 0 ? "above" : "below";
    p1 = `SPY ${fmt(last)} sits ${fmt(Math.abs(dist))} pts ${side} the ${tier} Main at ${fmt(main.value)}.`;
    if (upper && lower) {
      p1 += ` The ±3.4 band runs ${fmt(lower.value)} (Lower) to ${fmt(upper.value)} (Upper).`;
    }
    if (a2Main) {
      p1 += ` Anchor 2 Main is at ${fmt(a2Main.value)}.`;
    }
    if (isBackup) {
      p1 += ` (No primary anchor qualified today — using the deepest premarket bearish bar as a backup reference.)`;
    }
  } else {
    p1 = `SPY ${fmt(last)}. No premarket bearish bars on record — structure is on the pivot fallback (UA/UD/LA/LD).`;
  }

  // Paragraph 2 — bias + context + signal census
  const parts: string[] = [];
  parts.push(`Bias: ${snap.bias.label} (${fmtSigned(snap.bias.score, 0)}).`);

  const vix = snap.marketContext?.vix;
  if (vix?.value != null) {
    parts.push(`VIX ${fmt(vix.value)} (${vix.label}).`);
  }

  const pressure = snap.marketContext?.spyPressure;
  if (pressure && pressure.label !== "—") {
    const tail = pressure.value != null ? ` (${fmtSigned(pressure.value)} pts / 3 bars)` : "";
    parts.push(`SPY pressure: ${pressure.label}${tail}.`);
  }

  const confirmed = snap.signals.filter((s) => s.status === "CONFIRMED");
  const pending = snap.signals.filter((s) => s.status === "PENDING_CONFIRMATION");
  if (confirmed.length > 0) {
    parts.push(`${confirmed.length} confirmed signal${confirmed.length > 1 ? "s" : ""} on the tape.`);
  } else if (pending.length > 0) {
    parts.push(`${pending.length} pending rejection awaiting confirmation.`);
  } else {
    parts.push("No anchor triggers have printed yet.");
  }
  const p2 = parts.join(" ");

  // One-line directive
  const lastSignal = snap.signals[0];
  let close = "Watching the active lines for a touch + close pattern.";
  if (lastSignal && lastSignal.status === "CONFIRMED") {
    const sideWord = lastSignal.dir === "up" ? "long" : lastSignal.dir === "down" ? "short" : "flat";
    const entry = lastSignal.entry != null ? ` entry ${fmt(lastSignal.entry)}` : "";
    close = `Last confirmed: ${lastSignal.line} ${sideWord}${entry} at ${lastSignal.ts}.`;
  } else if (lastSignal && lastSignal.status === "PENDING_CONFIRMATION") {
    close = `Pending: ${lastSignal.line} rejection at ${lastSignal.ts} — wait for the next candle to open.`;
  } else {
    const gap = snap.marketContext?.triggerGap;
    if (gap && gap.points != null && gap.lineName !== "—") {
      const side = gap.points >= 0 ? "above" : "below";
      close = `Closest line: ${gap.lineName} — ${fmt(Math.abs(gap.points))} pts ${side} (${gap.label}). Watching for the touch + close.`;
    }
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 16 }}>
      {header}
      <p className="t-body-l c-primary" style={{ margin: "0 0 14px", lineHeight: 1.7, maxWidth: 760 }}>
        {p1}
      </p>
      <p className="t-body-l c-primary" style={{ margin: "0 0 14px", lineHeight: 1.7, maxWidth: 760 }}>
        {p2}
      </p>
      <p style={{
        margin: 0, fontStyle: "italic",
        color: "var(--text-secondary)",
        fontSize: 15, lineHeight: 1.6,
      }}>
        {close}
      </p>
    </div>
  );
}
