import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: resolve(import.meta.dirname, "src/index.jsx"), formats: ["es"], fileName: "index" },
    rollupOptions: { external: ["react", "react-dom"] }
  },
  test: { environment: "jsdom", setupFiles: "./src/setupTests.js", exclude: ["**/node_modules/**", "e2e/**"] } // e2e : npm run test:e2e
});
