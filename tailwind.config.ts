import type { Config } from "tailwindcss";

// Tokens lifted from the SPY Prophet standalone design bundle.
//   bg-canvas       0a0e14   page background
//   bg-surface      11161f   panels / cards
//   bg-surface-2    151b27   nested / pressed
//   border          1d2533
//   border-emph     2a3441
//   text-primary    e6e8eb
//   text-muted      8a93a3
//   text-dim        5b6473
//   accent-amber    f5b642   warnings / armed / SHORT bias
//   accent-cyan     5fb3d4   info / neutral
//   accent-green    4ade80   long bias / wins
//   accent-red      f87171   breached / losses
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0a0e14",
        surface: "#11161f",
        "surface-2": "#151b27",
        "surface-pressed": "#1a2130",
        border: { DEFAULT: "#1d2533", emph: "#2a3441" },
        text: { primary: "#e6e8eb", muted: "#8a93a3", dim: "#5b6473" },
        accent: {
          amber: "#f5b642",
          cyan: "#5fb3d4",
          green: "#4ade80",
          red: "#f87171",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontVariantNumeric: { tabular: "tabular-nums" },
    },
  },
  plugins: [],
};

export default config;
