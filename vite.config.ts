import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 9000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:9001",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/backend/**', '**/release/**', '**/dist/**'],
    },
  },
});
