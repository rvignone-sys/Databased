import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API calls to Flask on :5000.
// Production: `vite build` emits to web/dist, served by Flask.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5000",
      "/agent": "http://127.0.0.1:5000",
    },
  },
});
