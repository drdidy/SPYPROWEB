"use client";

import { useState } from "react";

import { getStockIdentity } from "@/lib/stocks/logos";
import { cn } from "@/lib/utils";

type StockLogoProps = {
  ticker: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  dark?: boolean;
};

const sizeClass = {
  xs: "h-6 w-6 rounded-[7px] text-[8px]",
  sm: "h-8 w-8 rounded-[9px] text-[10px]",
  md: "h-12 w-12 rounded-[12px] text-[13px]",
  lg: "h-14 w-14 rounded-[14px] text-[15px]",
};

export function StockLogo({
  ticker,
  size = "sm",
  className,
  dark = false,
}: StockLogoProps) {
  const [failed, setFailed] = useState(false);
  const identity = getStockIdentity(ticker);
  const normalized = identity.ticker || ticker.toUpperCase();
  const label = `${identity.name} logo`;

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden border shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_26px_-22px_rgba(7,17,22,0.92)]",
        dark ? "border-paper/16 bg-paper/92" : "border-rule bg-paper",
        sizeClass[size],
        className,
      )}
      title={identity.name}
    >
      {!failed && identity.domain ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/stocks/logo?ticker=${encodeURIComponent(normalized)}`}
          alt={label}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-[18%]"
        />
      ) : (
        <span
          role="img"
          aria-label={label}
          className={cn(
            "grid h-full w-full place-items-center bg-gradient-to-br font-mono font-bold text-paper",
            stockLogoTone(normalized),
          )}
        >
          {normalized.slice(0, 4)}
        </span>
      )}
    </span>
  );
}

function stockLogoTone(ticker: string): string {
  const tones = [
    "from-[#0A7589] via-[#0D9488] to-[#B8821F]",
    "from-[#7C2D12] via-[#B45309] to-[#B8821F]",
    "from-[#1E3A5F] via-[#2563EB] to-[#0A7589]",
    "from-[#14532D] via-[#15803D] to-[#B8821F]",
    "from-[#4C1D95] via-[#7C3AED] to-[#0A7589]",
    "from-[#7F1D1D] via-[#BE123C] to-[#B8821F]",
  ];
  const seed = ticker
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return tones[seed % tones.length];
}
