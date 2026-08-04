import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ["@supabase/supabase-js"]
        }
      }
    }
  }
});
