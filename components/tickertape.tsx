// Top tickertape strip: bias, last, change, OHLC, VIX/DXY/VVIX. Sits under
// the top of the main column.
import type { Snapshot } from "@/lib/types";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function Cell({ label, value, color = "var(--text-primary)" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "0 18px", borderRight: "1px solid var(--border-subtle)",
      whiteSpace: "nowrap",
    }}>
      <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>{label}</span>
      <span className="t-body-num" style={{ fontSize: 13, color }}>{value}</span>
    </div>
  );
}

export function Tickertape({ snap }: { snap: Snapshot }) {
  const { quote, bias, context } = snap;
  const chgColor = quote.chg >= 0 ? "var(--green)" : "var(--red)";
  const biasColor = bias.score <= -25 ? "var(--red)" : bias.score >= 25 ? "var(--green)" : "var(--amber)";
  return (
    <div className="tickertape">
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 18px", borderRight: "1px solid var(--border-subtle)",
        height: "100%",
      }}>
        <span className="dot price-pulse" style={{ background: biasColor, width: 8, height: 8 }}/>
        <span className="t-caption" style={{ letterSpacing: "0.16em", fontWeight: 600, color: biasColor }}>
          {bias.label}
        </span>
        <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>
          {bias.score > 0 ? "+" : ""}{bias.score}/100
        </span>
      </div>
      <Cell label="SPY" value={fmt(quote.last)} />
      <Cell
        label="CHG"
        value={`${quote.chg >= 0 ? "+" : ""}${fmt(quote.chg)} (${quote.chgPct >= 0 ? "+" : ""}${fmt(quote.chgPct, 3)}%)`}
        color={chgColor}
      />
      <Cell label="OPEN" value={fmt(quote.open)} />
      <Cell label="HIGH" value={fmt(quote.high)} />
      <Cell label="LOW" value={fmt(quote.low)} />
      <Cell label="PREV" value={fmt(quote.prevClose)} />
      <Cell label="VIX" value={fmt(context.vix)} />
      <Cell label="DXY" value={fmt(context.dxy)} />
      <Cell label="VVIX" value={fmt(context.vvix)} />
      <div style={{ flex: 1 }}/>
      <div style={{ padding: "0 18px", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="t-caption c-tertiary" style={{ letterSpacing: "0.12em" }}>SOURCE</span>
        <span className="pill pill-outline" style={{ height: 18, fontSize: 10 }}>{snap.source.toUpperCase()}</span>
      </div>
    </div>
  );
}
