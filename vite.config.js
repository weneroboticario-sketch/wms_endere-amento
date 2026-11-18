import { resolve } from 'node:path';
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    preserveSymlinks: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      ...(process.env.EXCELLENCE_DEMO_ENABLED === 'true' ? { input: { main: resolve('index.html'), excellenceDemo: resolve('tests/excellence/demo.html') } } : {}),
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
