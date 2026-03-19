import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ballyhegan Davitts GAA colours — matched from ballyhegan.gaa.ie
        primary: {
          50: "#f5f7fa",
          100: "#e8ecf1",
          200: "#d1d9e3",
          300: "#a8b5c6",
          400: "#7a8da5",
          500: "#5a6f8a",
          600: "#475a72",
          700: "#3a4a5e",
          800: "#343a40",  // Bootstrap bg-dark (navbar)
          900: "#2b3035",
          950: "#212529",  // Body text dark
        },
        // Accent blue from the GAA site
        accent: {
          50: "#eef5fc",
          100: "#d4e6f9",
          200: "#a9cdf3",
          300: "#7eb4ed",
          400: "#4a96e3",
          500: "#1E73BE",  // Primary blue accent
          600: "#1a63a5",
          700: "#15508a",
          800: "#113d6a",
          900: "#0d2e52",
        },
        // Booking type colours
        training: "#22c55e",
        match: "#1E73BE",
        fixture: "#f97316",
        closed: "#ef4444",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
