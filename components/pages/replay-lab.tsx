// Replay Lab — chart + scrubber + as-of decision panel. From 81ed613d*.
import type { Snapshot } from "@/lib/types";
import { PageHeader } from "../page-header";
import { ProphetChart } from "../prophet-chart";

export function ReplayLab({ snap }: { snap: Snapshot }) {
  return (
    <>
      <PageHeader
        title="Replay Lab"
        desc="Step through any prior session bar-by-bar. Freeze the decision state at any moment to study how the slate would have read it."
        action={<button className="btn btn-primary">LOAD SESSION</button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16 }}>
        <div>
          <ProphetChart snap={snap}/>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span className="t-heading">SCRUBBER</span>
              <div style={{ flex: 1 }}/>
              <div className="tf-group">
                {["1x", "5x", "30x", "60x"].map((s, i) => (
                  <button key={s} className={`tf-pill ${i === 1 ? "active" : ""}`}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{ position: "relative", height: 32, background: "var(--surface-pressed)", borderRadius: 4 }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "62%", background: "var(--surface-elev)" }}/>
              {[12, 28, 44, 52, 72, 84].map((p) => (
                <div key={p} style={{ position: "absolute", left: `${p}%`, top: 6, bottom: 6, width: 2, background: "var(--amber)" }}/>
              ))}
              <div style={{
                position: "absolute", left: "62%", top: -4, bottom: -4, width: 2,
                background: "var(--amber)", boxShadow: "0 0 0 3px rgba(245,182,66,0.2)",
              }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span className="t-caption c-tertiary">08:30 CT</span>
              <span className="t-caption c-amber mono">11:42:18 CT</span>
              <span className="t-caption c-tertiary">15:00 CT</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 20, height: "fit-content" }}>
          <div className="t-label c-tertiary" style={{ marginBottom: 12 }}>AS-OF DECISION</div>
          <div style={{ height: 6, width: 48, background: "var(--red)", marginBottom: 8 }}/>
          <div className="t-display-m c-red" style={{ marginBottom: 12 }}>SHORT</div>
          <p className="t-body c-secondary" style={{ margin: "0 0 16px" }}>
            Frozen at the moment of trigger. Replay paused.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="t-caption c-tertiary">QUALITY</span>
              <span className="t-body-num">8.2</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="t-caption c-tertiary">BIAS</span>
              <span className="t-caption c-red">BEARISH</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="t-caption c-tertiary">OUTCOME</span>
              <span className="t-body-num c-green">+0.41%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
