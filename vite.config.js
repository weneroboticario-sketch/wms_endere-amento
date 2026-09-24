import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/dompurify")) return "security";
          if (id.includes("/src/auth.js") || id.includes("/src/supabase-client.js") || id.includes("/src/warehouses.js")) {
            return "wms-core";
          }
          return undefined;
        }
      }
    }
  }
});
