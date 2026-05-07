// Bipolar bias bar lifted from e108b48a* in the design bundle: -100..+100,
// fills outward from a center divider. Negative goes red-amber to the left,
// positive goes green to the right.
export function BiasBar({ value }: { value: number }) {
  const pct = Math.max(-100, Math.min(100, value));
  const w = Math.abs(pct) / 2;
  const color = pct >= 0 ? "var(--accent-green)" : "var(--accent-amber)";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1 bg-surface-pressed relative rounded-sm">
        <div className="absolute left-1/2 -top-0.5 -bottom-0.5 w-px bg-border-emph" />
        <div
          className="absolute h-1 rounded-sm"
          style={{
            left: pct >= 0 ? "50%" : `${50 - w}%`,
            width: `${w}%`,
            background: color,
          }}
        />
      </div>
      <span className="tabular text-[10px] w-7 text-right text-text-muted">
        {pct > 0 ? "+" : ""}
        {pct}
      </span>
    </div>
  );
}
