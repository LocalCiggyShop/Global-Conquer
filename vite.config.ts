import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Windows-mounted WSL workspaces do not consistently deliver file events.
    watch: { usePolling: true, interval: 600 },
  },
  build: {
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
