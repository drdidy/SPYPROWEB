import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF8F3",
        paper: "#FFFFFF",
        "paper-2": "#F4EFE3",
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
        },
      },

      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ['"Tiempos Headline"', '"Playfair Display"', "Georgia", "serif"],
      },

      fontSize: {
        // editorial scale
        hero: ["96px", { lineHeight: "0.92", letterSpacing: "-0.04em", fontWeight: "300" }],
        verdict: ["80px", { lineHeight: "0.95", letterSpacing: "-0.035em", fontWeight: "300" }],
        display: ["44px", { lineHeight: "1.04", letterSpacing: "-0.025em", fontWeight: "400" }],
        headline: ["28px", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "500" }],
        title: ["18px", { lineHeight: "1.25", letterSpacing: "-0.005em", fontWeight: "600" }],
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
