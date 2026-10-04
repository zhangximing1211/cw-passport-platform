import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // `npm run dev` also starts the Worker API (`wrangler dev`) on 8787.
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
