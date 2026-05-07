// Daily Brief — editorial morning read. Lifted from 81ed613d* in the bundle.
import { PageHeader } from "../page-header";

export function DailyBrief() {
  return (
    <>
      <PageHeader
        title="Daily Brief"
        desc="The morning read, end to end. Bias, levels, and the trade thesis for today's session."
        action={<span className="t-caption c-tertiary">07:42 CT · published</span>}
      />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {["BIAS · BEARISH", "RANGE · 581–584", "VOL · LOW"].map((t, i) => (
            <div key={t} className="card" style={{ flex: 1, padding: 12 }}>
              <div className="t-caption c-tertiary">{i + 1}</div>
              <div className="t-body" style={{ marginTop: 4, color: "var(--text-primary)", fontWeight: 500 }}>{t}</div>
            </div>
          ))}
        </div>

        <div className="t-display-xl c-primary" style={{ marginBottom: 8 }}>BEARISH</div>
        <p className="t-body-l c-secondary" style={{ marginTop: 0 }}>
          SPY rejected the 4H supply line yesterday and is set up to retest 581.85 today.
        </p>

        <p className="t-body-l c-primary" style={{ lineHeight: 1.7 }}>
          Yesterday closed weak — every bounce was absorbed and the tape never produced the late-day acceleration buyers needed. Distribution of that profile at 4H supply indicates institutional flow has rotated, and the path of least resistance for at least the first half of today's session is lower.
        </p>

        <div className="card" style={{ padding: 16, margin: "16px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
          {[
            { l: "YDAY HIGH", v: "584.12" },
            { l: "YDAY LOW",  v: "580.04" },
            { l: "YDAY CLOSE", v: "582.55" },
          ].map((c) => (
            <div key={c.l}>
              <div className="t-label c-tertiary">{c.l}</div>
              <div className="t-body-num" style={{ fontSize: 18, marginTop: 4 }}>{c.v}</div>
            </div>
          ))}
        </div>

        <p className="t-body-l c-primary" style={{ lineHeight: 1.7 }}>
          The preferred trade is the retest of 581.85 on diminishing volume. Anything more aggressive — a direct flush to 580 in the first 30 minutes — should be treated as a stop-and-reverse setup rather than continuation. Patience over conviction today.
        </p>
      </div>
    </>
  );
}
