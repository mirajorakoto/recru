// Application « hôte » : elle assemble la console RH (packages/admin-ui) et le site public
// (packages/public-ui) en une seule application web servie par nginx.
// Les paquets sont lus directement depuis leurs sources : aucun build préalable n'est nécessaire.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const here = import.meta.dirname;
const dep = (name) => resolve(here, "node_modules", name);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@techzone/recruitment-admin": resolve(here, "../../packages/admin-ui/src/index.jsx"),
      "@techzone/recruitment-public": resolve(here, "../../packages/public-ui/src/index.jsx"),
      // Les sources des paquets importent react et dompurify : on force une seule copie, celle de cette application.
      react: dep("react"),
      "react-dom": dep("react-dom"),
      dompurify: dep("dompurify")
    },
    dedupe: ["react", "react-dom"]
  },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3111" } },
  build: { outDir: "dist", sourcemap: false }
});
