import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 1440 boundary used by wide trading screens (1440 / 1600) so
      // dense instrument rows can expand without waiting for 2xl.
      screens: {
        "xl-plus": "1440px",
      },

      // SPY Prophet operational palette. Five inks, no tints, no
      // gradients. Everything else is derived with alpha.
      colors: {
        optic: "#F5F6F1", // optic white — light operational surface
        carbon: "#0A0B0C", // carbon black — dark operational surface
        lime: "#B8F23D", // electric lime — command / go
        cobalt: "#3157FF", // cobalt blue — instruction / context
        coral: "#FF5B4D", // signal coral — stop / invalidation

        // Accessible ink variants for small text on light surfaces.
        "go-ink": "#087A50",
        "stop-ink": "#B52F24",
        "warn-ink": "#8A5A00",
      },

      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      transitionTimingFunction: {
        swift: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        exit: "cubic-bezier(0.22, 1, 0.36, 1)",
      },

      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        scanline: {
          "0%": { transform: "translateX(-10%)" },
          "100%": { transform: "translateX(1200%)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        ticker: "ticker 36s linear infinite",
        scanline: "scanline 9s linear infinite",
        blink: "blink 1.6s steps(2, start) infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
