// Brand wordmark. The small "Beta" pip is rendered alongside the
// logo so the closed-beta status reads as a product fact in the
// header — replacing the prior "closed beta" line tucked under the
// user avatar, which was easy to miss.

import { Chip, CHIP_TONES } from "@/components/ui/Chip";

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width="27" height="27" viewBox="0 0 27 27" className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id="wm-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C7821A" />
            <stop offset="55%" stopColor="#B8821F" />
            <stop offset="100%" stopColor="#8A5E10" />
          </linearGradient>
          <linearGradient id="wm-green" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#0B4F3A" />
            <stop offset="100%" stopColor="#16A06A" />
          </linearGradient>
        </defs>
        <circle cx="13.5" cy="13.5" r="12" fill="#FBF8EF" stroke="url(#wm-gold)" strokeWidth="1.35" />
        <circle cx="13.5" cy="13.5" r="7.8" fill="none" stroke="#8A5E10" strokeDasharray="1 2.4" strokeOpacity="0.42" />
        <path
          d="M13.5 2.7 15.3 11.7 24.3 13.5 15.3 15.3 13.5 24.3 11.7 15.3 2.7 13.5 11.7 11.7Z"
          fill="none"
          stroke="url(#wm-gold)"
          strokeWidth="0.95"
          strokeLinejoin="round"
        />
        <path d="M7.3 17.5 13.1 13.1 21 7.6 15.4 15.4Z" fill="url(#wm-green)" opacity="0.9" />
        <path d="M6.2 9.5 13.2 13.3 21 17.6 12 14.9Z" fill="url(#wm-gold)" opacity="0.86" />
        <circle cx="13.5" cy="13.5" r="2.7" fill="#FBF8EF" stroke="#8A5E10" strokeOpacity="0.45" />
        <circle cx="13.5" cy="13.5" r="1.45" fill="url(#wm-gold)" />
      </svg>
      {!collapsed && (
        <div className="leading-none flex items-center gap-1.5">
          <div>
            <div className="text-[9px] tracking-[0.28em] text-ink-3 mb-0.5">SPY</div>
            <div className="text-[15px] font-serif font-medium tracking-tight text-ink">
              Prophet
            </div>
          </div>
          {/* v10 P1-10: routed through the shared <Chip /> primitive
              so BETA, engine state chips, and provenance chips all
              read as one family — same shape, same weight, only the
              color tones differ. */}
          <Chip tone={CHIP_TONES.beta} ariaLabel="Closed beta">
            Beta
          </Chip>
        </div>
      )}
    </div>
  );
}
