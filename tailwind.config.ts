import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 1440 boundary used by the SPX/SPY pipeline stepper to switch
      // between abbreviated and full step labels. Tailwind's stock
      // breakpoints jump from 1280 (xl) straight to 1536 (2xl); the
      // stepper needs a pivot in that gap so trader-screen widths
      // (1440 / 1600) get the readable full label without the 1280
      // crowd losing their layout.
      screens: {
        "xl-plus": "1440px",
      },
      colors: {
        canvas: "#FAF8F3",
        paper: "#FFFFFF",
        "paper-2": "#F4EFE3",
        // Cooler cream-grey surface used to differentiate "preview /
        // not-live" sections from the warm live-paper palette. Slight
        // sage cast keeps it inside the cream family but unambiguously
        // not the same surface as paper / paper-2.
        "paper-cool": "#EEF0EB",
        // Branded tint surface for the Recommended Action hero — a
        // desaturated gold that picks up the brand chip without
        // competing with the data cards beneath.
        "paper-brand": "#FAF1DC",
        sunken: "#EFE9DA",

        ink: {
          DEFAULT: "#14161A",
          1: "#14161A",
          2: "#3D424D",
          3: "#6B7280",
          4: "#9CA3AF",
          5: "#C8CDD3",
        },

        rule: {
          DEFAULT: "#E8E2D2",
          soft: "#EFEADC",
          strong: "#D4CBB6",
        },

        gold: {
          DEFAULT: "#B8821F",
          soft: "#F4E4C0",
          tint: "#FBF4DF",
          ink: "#5C3F0B",
        },

        bull: {
          DEFAULT: "#0E7C50",
          soft: "#D9EFE3",
          tint: "#EAF7EF",
          ink: "#0A4A30",
        },

        bear: {
          DEFAULT: "#B5301E",
          soft: "#F4D9D3",
          tint: "#FBEDEA",
          ink: "#681B11",
        },

        teal: {
          DEFAULT: "#0A7589",
          soft: "#D2EAEF",
          tint: "#EAF5F8",
        },

        violet: {
          DEFAULT: "#5B3FB1",
          soft: "#E0D8F2",
          tint: "#F1ECFA",
        },

        // grade chips
        grade: {
          aplus: "#0E7C50",
          a: "#0E7C50",
          b: "#B8821F",
          c: "#C76A1E",
          d: "#A04020",
          no: "#6B7280",
        },

        // signal states
        state: {
          armed: "#0A7589",
          watching: "#B8821F",
          confirmed: "#0E7C50",
          breached: "#B5301E",
          stale: "#9CA3AF",

          // Phase-1 hardening: semantic state palette. Use these for
          // delta values, ladders, and trigger chips. The neutral token
          // is the rule for "+0.00" / unknown / no-change — never bull green.
          bullish: "#0E7C50",
          bearish: "#B5301E",
          neutral: "#6B7280",
          triggered: "#0A7589",
          invalidated: "#9CA3AF",
        },
      },

      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ['"Tiempos Headline"', '"Playfair Display"', "Georgia", "serif"],
      },

      fontSize: {
        // editorial scale
        // Fluid display sizes via clamp(min, preferred, max) so these
        // scale smoothly from 360px → 1920px without breakpoint jumps.
        // Floor matches the smallest spec breakpoint (360px); ceiling
        // is the previous fixed value.
        hero: ["clamp(56px, 7.5vw, 96px)", { lineHeight: "0.92", letterSpacing: "-0.04em", fontWeight: "300" }],
        verdict: ["clamp(48px, 6vw, 80px)", { lineHeight: "0.95", letterSpacing: "-0.035em", fontWeight: "300" }],
        display: ["clamp(32px, 4vw, 44px)", { lineHeight: "1.04", letterSpacing: "-0.025em", fontWeight: "400" }],
        headline: ["clamp(22px, 2.4vw, 28px)", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "500" }],
        title: ["18px", { lineHeight: "1.25", letterSpacing: "-0.005em", fontWeight: "600" }],
        // Slate refinement (2026-05): explicit type-scale tiers for
        // body / meta so consumers stop reaching for arbitrary
        // text-[12px] / text-[13px] / text-[14px] values. Keeps the
        // editorial scale honest and lets us audit later by grep.
        h2: ["18px", { lineHeight: "1.25", letterSpacing: "-0.005em", fontWeight: "600" }],
        h3: ["15px", { lineHeight: "1.3", letterSpacing: "-0.005em", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.55", letterSpacing: "0", fontWeight: "400" }],
        meta: ["12px", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],
        eyebrow: ["10px", { lineHeight: "1", letterSpacing: "0.16em", fontWeight: "600" }],
        micro: ["10.5px", { lineHeight: "1.25", letterSpacing: "0.02em", fontWeight: "500" }],
      },

      borderRadius: {
        card: "12px",
        soft: "8px",
        pill: "999px",
      },

      boxShadow: {
        // crisp paper shadows
        rule: "0 0 0 1px #E8E2D2",
        "rule-strong": "0 0 0 1px #D4CBB6",
        card: "0 1px 0 0 #E8E2D2, 0 1px 2px -1px rgba(20,22,26,0.04)",
        "card-hover":
          "0 0 0 1px #D4CBB6, 0 8px 24px -8px rgba(20,22,26,0.10), 0 2px 6px -2px rgba(20,22,26,0.06)",
        focus: "0 0 0 3px rgba(184,130,31,0.22)",
        glow: "0 8px 32px -8px rgba(184,130,31,0.30)",
      },

      transitionTimingFunction: {
        swift: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        editorial: "cubic-bezier(0.4, 0.0, 0.0, 1)",
      },

      keyframes: {
        breathe: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
        // Slate skeleton shimmer. Single L→R sweep used by <Skeleton />.
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        flashUp: {
          "0%": { backgroundColor: "rgba(14,124,80,0.18)" },
          "100%": { backgroundColor: "transparent" },
        },
        flashDown: {
          "0%": { backgroundColor: "rgba(181,48,30,0.18)" },
          "100%": { backgroundColor: "transparent" },
        },
        riseUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        breathe: "breathe 2.4s ease-in-out infinite",
        "flash-up": "flashUp 600ms ease-out",
        "flash-down": "flashDown 600ms ease-out",
        rise: "riseUp 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        ticker: "ticker 60s linear infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },

      backgroundImage: {
        "grain":
          "radial-gradient(circle at 1px 1px, rgba(20,22,26,0.04) 1px, transparent 0)",
        "page-edge":
          "linear-gradient(180deg, rgba(20,22,26,0) 0%, rgba(20,22,26,0.025) 100%)",
        "gold-sweep":
          "linear-gradient(135deg, #FBF4DF 0%, #F4E4C0 50%, #E8CD8C 100%)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
