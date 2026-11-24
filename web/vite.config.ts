import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const r = (p: string) => path.resolve(__dirname, p);

// Statická verze pro GitHub Pages: SPA (hash router) + service worker jako backend.
export default defineConfig({
  root: r("."),
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "next/link", replacement: r("src/shims/link.tsx") },
      { find: "next/navigation", replacement: r("src/shims/navigation.ts") },
      { find: /^@\/(.*)$/, replacement: r("../src") + "/$1" },
    ],
  },
  define: {
    "process.env.NEXT_PUBLIC_API_BASE": JSON.stringify("api"),
    "process.env.NEXT_PUBLIC_STATIC": JSON.stringify("1"),
  },
  build: {
    outDir: r("../dist-web"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { main: r("index.html"), sw: r("sw/sw.ts") },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js") },
    },
  },
});
