// vite.config.ts
import { execFile } from "node:child_process";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { findVillagerModel, hasCharacterModel } from "./scripts/character-model-paths.mts";

const bagFolder = "/models/characters/props/bag-black-gold";
const bagModelUrl = [
  `${bagFolder}/bag-black-gold-mobile.glb`,
  `${bagFolder}/bag-black-gold-garage.glb`,
  "/models/characters/shop-bag.glb",
].find(url => hasCharacterModel(new URL(`./public${url}`, import.meta.url)));
function characterLod(asset: ReturnType<typeof findVillagerModel>, kind: "garage" | "portrait") {
  if (!asset) return null;
  return asset.bundledLod(kind) ?? (hasCharacterModel(asset.output(kind)) ? asset.url(kind) : null);
}

const rook = findVillagerModel("male");
const vesper = findVillagerModel("female");
const vesperModelUrl = vesper?.sourceUrl ?? (vesper && hasCharacterModel(vesper.output("full")) ? vesper.url("full") : null);

export default defineConfig({
  define: {
    __CHARACTER_BAG_URL__: JSON.stringify(bagModelUrl ?? null),
    __VILLAGER_MODEL_URL__: JSON.stringify(vesperModelUrl),
    __VILLAGER_PORTRAIT_URL__: JSON.stringify(characterLod(vesper, "portrait") ?? vesperModelUrl),
    __ROOK_MODEL_URL__: JSON.stringify(characterLod(rook, "garage") ?? rook?.sourceUrl ?? null),
    __ROOK_PORTRAIT_URL__: JSON.stringify(characterLod(rook, "portrait") ?? rook?.sourceUrl ?? null),
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
