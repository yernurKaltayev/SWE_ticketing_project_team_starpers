import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_ORIGIN || "http://localhost:8000";
  if (!/^https?:\/\//.test(target))
    throw new Error("API_ORIGIN must be an HTTP(S) origin.");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      // Playwright writes downloads/traces here; Windows may lock temporary files.
      watch: {
        ignored: ["**/output/**", "**/test-results/**", "**/playwright-report/**"],
      },
      proxy: {
        "/c/": { target, changeOrigin: true },
        "/api": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
      },
    },
  };
});
