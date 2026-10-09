import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    // `npm run dev` talks to a gateway running on the host; in Docker nginx does this proxying
    proxy: { "/api": "http://34.171.152.81:3000" },
  },
});
