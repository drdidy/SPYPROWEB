import type { CryptoAssetKey } from "@/lib/crypto/types";
import { cn } from "@/lib/utils";

type CryptoLogoProps = {
  asset: CryptoAssetKey;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  dark?: boolean;
};

const sizeClass = {
  xs: "h-6 w-6 rounded-[7px]",
  sm: "h-8 w-8 rounded-[9px]",
  md: "h-12 w-12 rounded-[12px]",
  lg: "h-14 w-14 rounded-[14px]",
};

export function CryptoLogo({
  asset,
  size = "sm",
  className,
  dark = false,
}: CryptoLogoProps) {
  const label = asset === "BTC" ? "Bitcoin logo" : "Ethereum logo";

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden border shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_26px_-22px_rgba(7,17,22,0.92)]",
        dark ? "border-paper/16 bg-paper/92" : "border-rule bg-paper",
        sizeClass[size],
        className,
      )}
      title={asset === "BTC" ? "Bitcoin" : "Ethereum"}
      role="img"
      aria-label={label}
    >
      {asset === "BTC" ? <BitcoinMark /> : <EthereumMark />}
    </span>
  );
}

function BitcoinMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <circle cx="32" cy="32" r="32" fill="#F7931A" />
      <path
        fill="#fff"
        d="M41.5 28.6c.7-4.7-2.9-7.2-7.8-8.9l1.6-6.3-3.9-1-1.5 6.1c-1-.2-2.1-.5-3.1-.7l1.5-6.1-3.9-1-1.6 6.3c-.8-.2-1.7-.4-2.5-.6v-.1l-5.4-1.3-1 4.2s2.9.7 2.8.7c1.6.4 1.8 1.4 1.8 2.2l-1.8 7.2c.1 0 .2.1.4.1l-.4-.1-2.5 10.1c-.2.5-.7 1.3-1.8 1-.1.1-2.8-.7-2.8-.7l-1.9 4.5 5.1 1.3c.9.2 1.9.5 2.8.7L14 52.6l3.9 1 1.6-6.4c1.1.3 2.1.6 3.1.8L21 54.3l3.9 1 1.6-6.3c6.7 1.3 11.7.8 13.8-5.3 1.7-4.9-.1-7.8-3.6-9.6 2.6-.6 4.5-2.3 4.8-5.5Zm-8.6 12c-1.2 4.9-9.5 2.3-12.2 1.6l2.2-8.8c2.7.7 11.3 2 10 7.2Zm1.2-12.1c-1.1 4.5-8 2.2-10.3 1.6l2-8c2.3.6 9.5 1.7 8.3 6.4Z"
      />
    </svg>
  );
}

function EthereumMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#F7F8FA" />
      <path d="M32 6 16 33.1 32 25.8l16 7.3L32 6Z" fill="#627EEA" />
      <path d="M32 25.8 16 33.1 32 42.6l16-9.5-16-7.3Z" fill="#3C3C3D" opacity=".72" />
      <path d="M16 36.2 32 58l16-21.8-16 9.5-16-9.5Z" fill="#627EEA" />
      <path d="M32 6v19.8l16 7.3L32 6ZM32 42.6V58l16-21.8-16 6.4Z" fill="#2F4FD8" opacity=".55" />
    </svg>
  );
}
