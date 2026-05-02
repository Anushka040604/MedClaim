/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        accent: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
        },
      },
      backgroundImage: {
        "gradient-app": "linear-gradient(135deg, #ecfdf5 0%, #f8fafc 55%, #f1f5f9 100%)",
        "gradient-primary": "linear-gradient(135deg, #059669 0%, #10b981 55%, #34d399 100%)",
        "gradient-card": "linear-gradient(180deg, #ffffff 0%, #f7fffb 100%)",
        "gradient-hero": "linear-gradient(135deg, #d1fae5 0%, #e0f2fe 55%, #ffffff 100%)",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-hover": "0 10px 30px -8px rgb(5 150 105 / 0.18), 0 8px 18px -10px rgb(0 0 0 / 0.08)",
        "card-primary": "0 10px 30px -12px rgb(5 150 105 / 0.28)",
        input: "0 0 0 1px rgb(0 0 0 / 0.05)",
        "input-focus": "0 0 0 2px rgb(5 150 105 / 0.35)",
        "nav": "0 1px 0 0 rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
};
