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
        foreground: "hsl(var(--foreground))"
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
      boxShadow: {
        elevated: "0 1px 3px rgba(0, 0, 0, 0.08)"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
