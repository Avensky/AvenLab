// vite.config.ts
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const bagModelUrl = "/models/characters/shop-bag.glb";
const publicFile = (url: string) => new URL(`./public${url}`, import.meta.url);
const hasModel = (url: string) => (statSync(publicFile(url), { throwIfNoEntry: false })?.size ?? 0) >= 256;
function villagerLod(character: string, kind: "garage" | "portrait") {
  const source = `/models/characters/${character}.glb`;
  if (!hasModel(source)) return null;
  const lod = source.replace(".glb", `.${kind}.glb`);
  return hasModel(lod) ? lod : source;
}

export default defineConfig({
  define: {
    __CHARACTER_BAG_URL__: JSON.stringify(hasModel(bagModelUrl) ? bagModelUrl : null),
    __VILLAGER_MODEL_URL__: JSON.stringify(villagerLod("villager-female", "garage")),
    __VILLAGER_PORTRAIT_URL__: JSON.stringify(villagerLod("villager-female", "portrait")),
    __ROOK_MODEL_URL__: JSON.stringify(villagerLod("villager-male", "garage")),
    __ROOK_PORTRAIT_URL__: JSON.stringify(villagerLod("villager-male", "portrait")),
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
