import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
    // @ts-ignore
    plugins: [wasm(), topLevelAwait()],

    // ⭐ Tell Vite this is a SERVER build, not a frontend app
    build: {
        ssr: "src/index.ts",         // ⬅️ SSR ENTRY POINT
        outDir: "dist/server",
        emptyOutDir: true,
        target: "esnext",
        minify: false,
        rollupOptions: {
            input: "src/index.ts"      // ⬅️ REQUIRED so Vite does NOT look for index.html
        }
    },

    // ⭐ Avoid deps optimization for Rapier (breaks WASM)
    optimizeDeps: {
        exclude: ["@dimforge/rapier3d"]
    }
});
