import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sbx: {
          bg: "#0b1020",
          panel: "#121a2e",
          panel2: "#0f1526",
          border: "#233150",
          accent: "#4f8cff",
          accent2: "#7ba8ff",
          good: "#3fd39b",
          warn: "#f4b740",
          bad: "#ff6b6b",
          text: "#e6ecff",
          muted: "#8ea0c6",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
