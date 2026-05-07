// Structure Read editorial — long-form analysis with an italic close-out.
// Lifted from e108b48a* in the design bundle.

export function StructureRead() {
  return (
    <div className="card" style={{ padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 4, height: 18, background: "var(--amber)", borderRadius: 1 }}/>
        <span className="t-heading">STRUCTURE READ</span>
        <div style={{ flex: 1 }}/>
        <span className="t-caption c-tertiary">updated 11:48 CT</span>
      </div>
      <p className="t-body-l c-primary" style={{ margin: "0 0 14px", lineHeight: 1.7, maxWidth: 760 }}>
        SPY pushed into the 4H supply zone at 583.40 and printed a textbook rejection — a clean upper wick on a 5-minute candle, declining tape volume into the high, and breadth deteriorating off the morning strength. The bid that defended 581.85 through the European session has thinned, and the day's open at 582.40 is now functioning as the line of control rather than a magnet.
      </p>
      <p className="t-body-l c-primary" style={{ margin: "0 0 14px", lineHeight: 1.7, maxWidth: 760 }}>
        The setup is structural rather than aggressive. With VIX compressing from 15.8 toward 14.5 and dealer gamma flipping positive above 583, upside is capped in the absence of a fresh catalyst. The asymmetric trade is patience: allow price to retrace into 581.85 on diminishing volume, observe how the bid behaves at the level, and only then commit. Anything between 582.20 and 583.20 is range-bound — fade the edges, never the middle.
      </p>
      <p style={{
        margin: 0, fontStyle: "italic",
        color: "var(--text-secondary)",
        fontSize: 15, lineHeight: 1.6,
      }}>
        If 583.40 holds for the next 15 minutes, the 581.85 retest is the highest-quality entry on the board.
      </p>
    </div>
  );
}
