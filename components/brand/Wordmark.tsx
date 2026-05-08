export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
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
        <div className="leading-none">
          <div className="text-[9px] tracking-[0.28em] text-ink-3 mb-0.5">SPY</div>
          <div className="text-[15px] font-serif font-medium tracking-tight text-ink">
            Prophet
          </div>
        </div>
      )}
    </div>
  );
}
