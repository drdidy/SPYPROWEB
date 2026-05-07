// Pivot Source — explains where today's primary lines were anchored.
// Mirrors spyprost's `build_pivot_source_table` output: name, source,
// candle start/close, full OHLC, plus the slope used to project.
import type { PivotInfo, PivotsSnapshot } from "@/lib/types";

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) + " CT";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function PivotSource({ pivots }: { pivots: PivotsSnapshot }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{
        height: 48, display: "flex", alignItems: "center",
        padding: "0 20px", borderBottom: "1px solid var(--border-subtle)", gap: 16,
      }}>
        <span className="t-heading">PIVOT SOURCE</span>
        <span className="t-caption c-tertiary">
          Structure day {fmtDate(pivots.structureDay)} · slope {pivots.slope.toFixed(2)}/h
        </span>
        <div style={{ flex: 1 }}/>
        <span className="t-caption c-tertiary">Signal day {fmtDate(pivots.signalDay)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <PivotCard pivot={pivots.high} accent="var(--green)" label="HIGH PIVOT" />
        <div style={{ borderLeft: "1px solid var(--border-subtle)" }}>
          <PivotCard pivot={pivots.low}  accent="var(--red)" label="LOW PIVOT" />
        </div>
      </div>
    </div>
  );
}

function PivotCard({ pivot, accent, label }: { pivot: PivotInfo | null; accent: string; label: string }) {
  if (!pivot) {
    return (
      <div style={{ padding: 20 }}>
        <div className="t-label c-tertiary" style={{ marginBottom: 8 }}>{label}</div>
        <span className="t-caption c-tertiary">Pivot unavailable for the structure frame.</span>
      </div>
    );
  }
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 4, height: 14, background: accent }}/>
        <span className="t-label c-tertiary">{label}</span>
        {pivot.fallbackUsed && <span className="pill pill-stale" style={{ height: 18, fontSize: 10 }}>FALLBACK</span>}
      </div>

      <div className="t-display-m" style={{ color: accent, marginBottom: 4 }}>{fmt(pivot.price)}</div>
      <div className="t-caption c-tertiary" style={{ marginBottom: 16, letterSpacing: "0.08em" }}>{pivot.source.toUpperCase()}</div>

      <dl style={{
        display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 16,
        margin: 0,
      }}>
        <dt className="t-caption c-tertiary">Anchor</dt>
        <dd className="t-body-num" style={{ margin: 0, fontSize: 12 }}>{fmtTime(pivot.anchorTime)}</dd>

        {pivot.candleStarts && (
          <>
            <dt className="t-caption c-tertiary">Candle</dt>
            <dd className="t-body-num c-secondary" style={{ margin: 0, fontSize: 12 }}>
              {fmtTime(pivot.candleStarts)} → {fmtTime(pivot.candleCloses)}
            </dd>
          </>
        )}

        {pivot.candle && (
          <>
            <dt className="t-caption c-tertiary">OHLC</dt>
            <dd className="t-body-num c-secondary" style={{ margin: 0, fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>O</span> {fmt(pivot.candle.o)}{" "}
              <span style={{ color: "var(--green)" }}>H</span> {fmt(pivot.candle.h)}{" "}
              <span style={{ color: "var(--red)" }}>L</span> {fmt(pivot.candle.l)}{" "}
              <span style={{ color: "var(--text-primary)" }}>C</span> {fmt(pivot.candle.c)}
            </dd>
          </>
        )}

        <dt className="t-caption c-tertiary">Color</dt>
        <dd className="t-caption" style={{
          margin: 0,
          color: pivot.candleColor === "green" ? "var(--green)" : pivot.candleColor === "red" ? "var(--red)" : "var(--text-secondary)",
          textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          {pivot.candleColor}
        </dd>
      </dl>
    </div>
  );
}
