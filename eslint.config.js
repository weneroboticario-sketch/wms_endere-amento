export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/data/**", "WMS-codigo-completo-*/**", "supabase/functions/**"]
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        indexedDB: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        DOMParser: "readonly",
        TextEncoder: "readonly",
        Notification: "readonly",
        performance: "readonly",
        XLSX: "readonly",
        JsBarcode: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-unused-vars": "off"
    }
  }
];
