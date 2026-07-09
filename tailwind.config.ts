import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // The Night Watch palette (DESIGN.md — Visual Identity).
        // Green-cast stone neutrals: porcelain (50) through ink (900).
        neutral: {
          "50": "#F4F6F1",
          "100": "#E9EDE4",
          "200": "#D9DFD2",
          "300": "#BFC8B8",
          "400": "#93A08F",
          "500": "#6C7A6B",
          "600": "#556456",
          "700": "#3E4C41",
          "800": "#293630",
          "900": "#1B2620"
        },
        // Brand evergreen — primary actions, links, focus rings, active states.
        brand: {
          "50": "#EDF4EE",
          "100": "#DBE8DD",
          "200": "#B7D1BD",
          "600": "#2E5A4A",
          "700": "#234939",
          "800": "#1B3A2E"
        },
        // The night rail surface (sidebar / mobile nav).
        night: {
          DEFAULT: "#12211C",
          soft: "#1B2F28"
        },
        // The ember — the "alive now" signature mark. Never used for status.
        ember: {
          DEFAULT: "#E8A33D",
          deep: "#B97324"
        },
        // DESIGN.md pins yellow-600 to #D97706 (Tailwind's amber). Align the
        // scale so status yellows render on-token.
        yellow: {
          "50": "#FFFBEB",
          "100": "#FEF3C7",
          "500": "#F59E0B",
          "600": "#D97706",
          "700": "#B45309"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1.4" }],
        sm: ["0.8125rem", { lineHeight: "1.5" }],
        base: ["0.9375rem", { lineHeight: "1.6" }],
        md: ["1.0625rem", { lineHeight: "1.4" }],
        lg: ["1.25rem", { lineHeight: "1.3" }],
        xl: ["1.625rem", { lineHeight: "1.2" }],
        "2xl": ["2.125rem", { lineHeight: "1.1" }]
      },
      borderRadius: {
        md: "0.5rem",
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem"
      },
      boxShadow: {
        elevated: "0 1px 3px rgba(27, 38, 32, 0.08)",
        lift: "0 2px 10px rgba(27, 38, 32, 0.07)",
        pane: "0 8px 28px rgba(27, 38, 32, 0.14)",
        ember: "0 0 6px 1px rgba(232, 163, 61, 0.55)"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
