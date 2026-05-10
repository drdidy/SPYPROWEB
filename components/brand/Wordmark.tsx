// Brand wordmark. The small "Beta" pip is rendered alongside the
// logo so the closed-beta status reads as a product fact in the
// header — replacing the prior "closed beta" line tucked under the
// user avatar, which was easy to miss.

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id="wm-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C7821A" />
            <stop offset="55%" stopColor="#B8821F" />
            <stop offset="100%" stopColor="#8A5E10" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="url(#wm-gold)" strokeWidth="1.25" />
        <circle cx="12" cy="12" r="3" fill="url(#wm-gold)" />
        <line x1="12" y1="0.5" x2="12" y2="3.5" stroke="url(#wm-gold)" strokeWidth="1.25" strokeLinecap="round" />
        <line x1="12" y1="20.5" x2="12" y2="23.5" stroke="url(#wm-gold)" strokeWidth="1.25" strokeLinecap="round" />
        <line x1="0.5" y1="12" x2="3.5" y2="12" stroke="url(#wm-gold)" strokeWidth="1.25" strokeLinecap="round" />
        <line x1="20.5" y1="12" x2="23.5" y2="12" stroke="url(#wm-gold)" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
      {!collapsed && (
        <div className="leading-none flex items-center gap-1.5">
          <div>
            <div className="text-[9px] tracking-[0.28em] text-ink-3 mb-0.5">SPY</div>
            <div className="text-[15px] font-serif font-medium tracking-tight text-ink">
              Prophet
            </div>
          </div>
          {/* v8 P2-2: muted ochre per the cleanup spec — the v5 fully-
              saturated brand-gold solid was reading "loud" against the
              cream canvas. New tokens (bg #E8DCC2, fg #6B4F2A, border
              #C9B58C) are still unambiguously warm but sit one tier
              quieter so the chip reads as a status pip, not a CTA.
              Inline style keeps the v5 lesson — no theme-var or
              Tailwind-compile chain can override what's baked into the
              markup. */}
          <span
            className="rounded-pill px-1.5 py-px text-[9px] font-mono font-bold tracking-[0.10em] uppercase"
            style={{
              backgroundColor: "#E8DCC2",
              color: "#6B4F2A",
              border: "1px solid #C9B58C",
            }}
            aria-label="Closed beta"
          >
            Beta
          </span>
        </div>
      )}
    </div>
  );
}
