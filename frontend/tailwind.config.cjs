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
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        accent: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
      },
      backgroundImage: {
        "gradient-app": "linear-gradient(135deg, #f0fdfa 0%, #f8fafc 50%, #f1f5f9 100%)",
        "gradient-primary": "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
        "gradient-card": "linear-gradient(180deg, #ffffff 0%, #f8fffe 100%)",
        "gradient-hero": "linear-gradient(135deg, #ccfbf1 0%, #e0f2fe 50%, #f5f3ff 100%)",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-hover": "0 8px 24px -4px rgb(13 148 136 / 0.08), 0 4px 12px -2px rgb(0 0 0 / 0.04)",
        "card-primary": "0 4px 14px -2px rgb(13 148 136 / 0.12)",
        input: "0 0 0 1px rgb(0 0 0 / 0.05)",
        "input-focus": "0 0 0 2px rgb(13 148 136 / 0.35)",
        "nav": "0 1px 0 0 rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
};
