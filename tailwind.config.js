/** @type {import("tailwindcss").Config} */
export default {
  content: [
    "./src/web/index.html",
    "./src/web/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dense, no-marketing palette (REQ-051A)
        bg: { 0: "#0b0d10", 1: "#14181d", 2: "#1a1f25", 3: "#222831" },
        fg: { 0: "#eaeef3", 1: "#aab3bf", 2: "#6b7280" },
        accent: { DEFAULT: "#2563eb", hover: "#1d4ed8" },
        danger: "#f87171",
        warn:  "#facc15",
        ok:    "#34d399",
        border: "#2a3038",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
