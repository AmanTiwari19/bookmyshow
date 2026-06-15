import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All API calls are namespaced under /api so they never collide with
      // client-side page routes like /movies/:id or /shows/:id/seats.
      // The rewrite strips /api before forwarding to the backend, which still
      // serves /movies, /shows, etc.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
