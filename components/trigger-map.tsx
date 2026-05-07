// Trigger Map page from e108b48a* in the design bundle.
import type { Snapshot, TriggerStatus } from "@/lib/types";
import { BiasBar } from "./bias-bar";

const STATUS_PILL: Record<TriggerStatus, string> = {
  ARMED: "pill pill-amber",
  WATCHING: "pill pill-outline",
  BREACHED: "pill pill-red",
  STALE: "pill pill-stale",
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function TriggerMap({ snap }: { snap: Snapshot }) {
  return (
    <section className="px-10 py-8">
      <header className="mb-6">
        <h2 className="text-[18px] font-semibold tracking-tight">Trigger Map</h2>
        <p className="text-[11px] tracking-[0.12em] uppercase text-text-muted mt-1">
          Distance · BPS · Bias · Status
        </p>
      </header>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 text-text-dim text-[10px] tracking-[0.12em] uppercase">
            <tr>
              <th className="text-left font-medium px-4 py-2">Line</th>
              <th className="text-right font-medium px-4 py-2 tabular">Level</th>
              <th className="text-right font-medium px-4 py-2 tabular">Dist</th>
              <th className="text-right font-medium px-4 py-2 tabular">bps</th>
              <th className="text-left font-medium px-4 py-2 w-48">Bias</th>
              <th className="text-right font-medium px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {snap.triggers.map((t) => (
              <tr key={t.line} className="border-t border-border hover:bg-surface-2/40">
                <td className="px-4 py-2.5 text-text-primary">{t.line}</td>
                <td className="px-4 py-2.5 text-right tabular text-text-primary">{fmt(t.level)}</td>
                <td className={`px-4 py-2.5 text-right tabular ${t.dist >= 0 ? "text-accent-green" : "text-accent-amber"}`}>
                  {t.dist > 0 ? "+" : ""}{fmt(t.dist)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular ${t.bps >= 0 ? "text-accent-green" : "text-accent-amber"}`}>
                  {t.bps > 0 ? "+" : ""}{t.bps}
                </td>
                <td className="px-4 py-2.5"><BiasBar value={t.bias} /></td>
                <td className="px-4 py-2.5 text-right">
                  <span className={STATUS_PILL[t.status]}>{t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
