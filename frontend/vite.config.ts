// vite.config.ts
import { execFile } from "node:child_process";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { findVillagerModel, hasCharacterModel } from "./scripts/character-model-paths.mts";

const bagModelUrl = "/models/characters/shop-bag.glb";
const bagFile = new URL(`./public${bagModelUrl}`, import.meta.url);
function villagerLod(gender: "female" | "male", kind: "garage" | "portrait") {
  const asset = findVillagerModel(gender);
  if (!asset) return null;
  return hasCharacterModel(asset.output(kind)) ? asset.url(kind) : asset.sourceUrl;
}

export default defineConfig({
  define: {
    __CHARACTER_BAG_URL__: JSON.stringify(hasCharacterModel(bagFile) ? bagModelUrl : null),
    __VILLAGER_MODEL_URL__: JSON.stringify(villagerLod("female", "garage")),
    __VILLAGER_PORTRAIT_URL__: JSON.stringify(villagerLod("female", "portrait")),
    __ROOK_MODEL_URL__: JSON.stringify(villagerLod("male", "garage")),
    __ROOK_PORTRAIT_URL__: JSON.stringify(villagerLod("male", "portrait")),
  },
  // The road workbench has its own virtual bundle / preview build. Scanning all
  // preview HTML at app startup wasted work and attempted to resolve that bundle.
  optimizeDeps: { entries: ["index.html"] },
  resolve: { dedupe: ["react", "react-dom", "three"] },
  plugins: [
    {
      name: "installed-map-catalog",
      configureServer(server: ViteDevServer) {
        const directory = fileURLToPath(new URL("../avenlab-server/src/assets/blocks/", import.meta.url));
        const script = fileURLToPath(new URL("../scripts/sync-world-builder-map.mjs", import.meta.url));
        let timer: ReturnType<typeof setTimeout>;
        const refresh = (file: string) => {
          if (!resolve(file).startsWith(resolve(directory) + sep) || !file.endsWith("_colliders.json")) return;
          clearTimeout(timer);
          timer = setTimeout(() => execFile(process.execPath, [script], error => {
            if (error) server.config.logger.error(error.message);
            else server.ws.send({ type: "full-reload" });
          }), 200);
        };
        server.watcher.add(directory);
        server.watcher.on("add", refresh).on("change", refresh).on("unlink", refresh);
        server.httpServer?.once("close", () => { clearTimeout(timer); server.watcher.off("add", refresh).off("change", refresh).off("unlink", refresh); });
      },
    },
    react({ babel: { plugins: [["babel-plugin-react-compiler"]] } }),
    tailwindcss(),
  ],
  server: {
    port: 5174,
    proxy: {
      "/data": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
});
