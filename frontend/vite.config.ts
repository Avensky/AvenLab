// vite.config.ts
import { execFile } from "node:child_process";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { discoverWardrobeGarments, isWardrobeCatalogInput, wardrobeCatalogFile, wardrobeDirectory, wardrobePublicRoot } from "./scripts/discover-wardrobe-garments.mts";
import { findVillagerModel, hasCharacterModel, hasCompatibleWardrobeRevision } from "./scripts/character-model-paths.mts";
const wardrobeSets: { id: string }[] = JSON.parse(readFileSync(new URL("../avenlab-server/src/assets/character-wardrobe.json", import.meta.url), "utf8"));
const standaloneCorsetLods = Object.fromEntries(wardrobeSets.map(({ id }) => [id, {
  garage: hasCharacterModel(new URL(`./public/models/characters/female/wardrobe/corsets/${id}.garage.glb`, import.meta.url)),
  mobile: hasCharacterModel(new URL(`./public/models/characters/female/wardrobe/corsets/${id}.mobile.glb`, import.meta.url)),
}]));
const bundledWardrobeLods = Object.fromEntries(wardrobeSets.map(({ id }) => [id, {
  garage: hasCharacterModel(new URL(`./public/models/characters/wardrobe/${id}.garage.glb`, import.meta.url)),
  mobile: hasCharacterModel(new URL(`./public/models/characters/wardrobe/${id}.mobile.glb`, import.meta.url)),
}]));

const dressingRoomImports: { id: string; url: string; mobileUrl?: string; revisionUrl?: string; retired?: boolean }[] =
  JSON.parse(readFileSync(wardrobeCatalogFile, "utf8"));
const discoveredImports = discoverWardrobeGarments(wardrobePublicRoot, dressingRoomImports);
const activeImports = dressingRoomImports.filter(item => !item.retired);
const garmentFile = (url: string) => new URL(`./public${url}`, import.meta.url);
const installedRevisions = activeImports.filter(({ revisionUrl, url }) =>
  revisionUrl && hasCompatibleWardrobeRevision(garmentFile(revisionUrl), garmentFile(url)),
).map(({ id }) => id);
const bagFolder = "/models/characters/female/props/bag-black-gold";
const bagModelUrl = [
  `${bagFolder}/bag-black-gold-mobile.glb`,
  `${bagFolder}/bag-black-gold-garage.glb`,
  "/models/characters/props/bag-black-gold/bag-black-gold-mobile.glb",
  "/models/characters/props/bag-black-gold/bag-black-gold-garage.glb",
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
    __DISCOVERED_WARDROBE_GARMENTS__: JSON.stringify(discoveredImports),
    __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(activeImports.filter(item => hasCharacterModel(garmentFile(item.url))).map(item => item.id)),
    __DRESSING_ROOM_MOBILE_IDS__: JSON.stringify(activeImports.filter(item => item.mobileUrl && hasCharacterModel(garmentFile(item.mobileUrl))).map(item => item.id)),
    __DRESSING_ROOM_REVISION_IDS__: JSON.stringify(installedRevisions),
    __STANDALONE_CORSET_LODS__: JSON.stringify(standaloneCorsetLods),
    __BUNDLED_WARDROBE_LODS__: JSON.stringify(bundledWardrobeLods),
    __WARDROBE_SET_IDS__: JSON.stringify(Object.keys(bundledWardrobeLods).filter(id =>
      bundledWardrobeLods[id].garage && bundledWardrobeLods[id].mobile,
    )),
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
    {
      name: "installed-wardrobe-catalog",
      configureServer(server: ViteDevServer) {
        let timer: ReturnType<typeof setTimeout>;
        const refresh = (file: string) => {
          if (!isWardrobeCatalogInput(file)) return;
          clearTimeout(timer);
          timer = setTimeout(() => server.restart().catch(error => server.config.logger.error(String(error))), 250);
        };
        server.watcher.add([fileURLToPath(wardrobeCatalogFile), fileURLToPath(wardrobeDirectory)]);
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
