import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const apiTarget = process.env.RECRUITMENT_DEMO_API_URL || "http://127.0.0.1:3111";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@techzone\/recruitment-public\/styles\.css$/, replacement: resolve(import.meta.dirname, "../packages/public-ui/src/styles.css") },
      { find: /^@techzone\/recruitment-admin\/styles\.css$/, replacement: resolve(import.meta.dirname, "../packages/admin-ui/src/styles.css") },
      { find: "@techzone/recruitment-public", replacement: resolve(import.meta.dirname, "../packages/public-ui/src/index.jsx") },
      { find: "@techzone/recruitment-admin", replacement: resolve(import.meta.dirname, "../packages/admin-ui/src/index.jsx") }
    ]
  },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": { target: apiTarget, changeOrigin: true } }
  }
});
