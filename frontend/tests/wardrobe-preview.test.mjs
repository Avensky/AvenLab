import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

function wardrobePreviewServer() {
  return createServer({
    define: {
      __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(["skirt-01", "skirt-02", "skirt-03", "skirt-04", "gothic-skirt-02", "gothic-skirt-03", "bowtie-01"]),
      __DRESSING_ROOM_REVISION_IDS__: JSON.stringify(["gothic-skirt-02", "gothic-skirt-03"]),
      __STANDALONE_CORSET_LODS__: JSON.stringify({ "gothic-05": { garage: true, mobile: false } }),
      __BUNDLED_WARDROBE_LODS__: JSON.stringify({ "gothic-05": { garage: true, mobile: false } }),
    },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    plugins: [{
      name: "wardrobe-preview-test",
      enforce: "pre",
      transform(source, id) {
        if (id.endsWith("/GarageDriver.tsx")) return source
          .replace(/from "(?:@react-three\/(?:fiber|drei)|\.\/(?:CharacterTurntable|CharacterLoadingEffect|GarageEmotePlayer|StylizedDriver|villagerModel)|\.\.\/preview\/PreviewLoadingSeal)"/g, 'from "virtual:wardrobe-preview"')
          .replaceAll("<group ", "<div ").replaceAll("</group>", "</div>");
      },
      resolveId(id) { if (id === "virtual:wardrobe-preview") return "\0wardrobe-preview-test"; },
      load(id) {
        if (id !== "\0wardrobe-preview-test") return;
        return `
          import { createElement, useLayoutEffect } from "react";
          import { Group, SkinnedMesh } from "three";

          const assets = new Map(), invalidate = () => {};
          export const prepared = [], committed = [], loadedGarments = [], loadedBodies = [];
          export const useThree = selector => selector({ size: { width: 1200 }, invalidate });
          export const Html = ({ children }) => children;
          export const CharacterTurntable = ({ children }) => children;
          export const CharacterLoadingEffect = () => createElement("span", { "data-victory-loading": true });
          export const PreviewLoadingStatus = ({ label }) => createElement("span", { role: "status" }, label);
          export const StylizedDriver = () => null;
          export const villagerModelUrl = look => look.wardrobe?.set ?? "village";
          export const applyVillagerLook = () => {};

          export function makeAssetAvailable(url, meshName, fullBody = true) {
            const scene = new Group(), body = new Group();
            body.name = "BODY_WARDROBE";
            scene.name = url;
            if (fullBody) scene.add(body);
            if (meshName) {
              const mesh = new SkinnedMesh();
              mesh.name = meshName;
              scene.add(mesh);
            }
            assets.set(url, { scene });
          }
          export function delayAsset(url) {
            let resolve;
            const promise = new Promise(ready => { resolve = ready; });
            assets.set(url, { promise });
            return (fail = false) => {
              if (fail) assets.set(url, { error: new Error("Unavailable " + url) });
              else makeAssetAvailable(url);
              resolve();
            };
          }
          export function useGLTF(url) {
            const asset = assets.get(url);
            if (!asset) throw new Error("Unexpected " + url);
            if (asset.error) throw asset.error;
            if (asset.promise) throw asset.promise;
            return asset;
          }
          export function prepareVillager(scene, { garments, garmentBody, corsetSource }) {
            const root = new Group();
            root.userData.outfit = [scene.name, ...garments.map(({ item }) => item.id)].join(" ");
            loadedGarments.push(garments.map(garment => [garment.scene.name, garment.authoredFit]));
            loadedBodies.push([garmentBody?.parent?.name, corsetSource?.scene.name]);
            prepared.push(root.userData.outfit);
            return { root, dispose() {} };
          }
          export function GarageEmotePlayer({ root }) {
            useLayoutEffect(() => { committed.push(root.userData.outfit); }, [root]);
            return createElement("span", { "data-outfit": root.userData.outfit, "data-model": root.uuid });
          }
        `;
      },
    }],
  });
}

test("the fitting room keeps the last complete outfit until the latest selection is ready", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const caught = [];
  const renderer = createRoot(document.getElementById("root"), { onCaughtError: error => caught.push(error.message) });
  let vite;
  try {
    vite = await wardrobePreviewServer();
    const { GarageDriver } = await vite.ssrLoadModule("/src/game/characters/GarageDriver.tsx");
    const { DEFAULT_CHARACTER } = await vite.ssrLoadModule("/src/game/characters/characterCatalog.ts");
    const { getWardrobeGarment } = await vite.ssrLoadModule("/src/game/characters/wardrobeGarments.ts");
    const { useCharacterPreviewStore: preview } = await vite.ssrLoadModule("/src/game/characters/characterPreviewStore.ts");
    const { committed, prepared, loadedGarments, loadedBodies, makeAssetAvailable, delayAsset } =
      await vite.ssrLoadModule("virtual:wardrobe-preview");
    const url = id => getWardrobeGarment(id).url;
    makeAssetAvailable("village");
    makeAssetAvailable(url("skirt-01"));
    makeAssetAvailable(url("bowtie-01"));
    const second = delayAsset(url("skirt-02"));
    const third = delayAsset(url("skirt-03"));
    const fourth = delayAsset(url("skirt-04"));
    const wardrobe = { set: "gothic-02", shirt: "none", waist: "over" };
    const nextBase = delayAsset(wardrobe.set);
    const choose = (skirt, wardrobe, props = {}) => act(async () => renderer.render(createElement(GarageDriver, {
      choice: { ...DEFAULT_CHARACTER, garments: { skirt, bow: "bowtie-01" }, wardrobe },
      previewPacks: true, upright: true, ...props,
    })));
    const rendered = () => [...document.querySelectorAll("[data-outfit]")].map(node => node.dataset.outfit);
    const model = () => document.querySelector("[data-model]")?.dataset.model;
    const status = () => document.querySelector('[role="status"]')?.textContent;

    await choose("skirt-01");
    assert.deepEqual(rendered(), ["village skirt-01 bowtie-01"]);
    const firstModel = model();
    await choose("skirt-02");
    await choose("skirt-03");
    assert.equal(model(), firstModel);
    assert.equal(status(), "Loading garments");
    await act(async () => third());
    assert.deepEqual(rendered(), ["village skirt-03 bowtie-01"]);
    const thirdModel = model();
    await act(async () => second());
    assert.equal(model(), thirdModel, "a late result does not rebuild or replace the latest outfit");

    await choose("skirt-04");
    await act(async () => fourth(true));
    assert.equal(model(), thirdModel);
    assert.equal(status(), "Garment unavailable");
    await choose("skirt-03", wardrobe);
    assert.equal(model(), thirdModel, "loading a new base also keeps the previous complete outfit");
    await act(async () => nextBase(true));
    assert.equal(model(), thirdModel);
    assert.equal(status(), "Character model unavailable");
    assert.deepEqual(prepared, ["village skirt-01 bowtie-01", "village skirt-03 bowtie-01"]);
    assert.deepEqual(committed, prepared, "only one complete replacement commits");

    const secondGothic = getWardrobeGarment("gothic-skirt-02");
    const thirdGothic = getWardrobeGarment("gothic-skirt-03");
    makeAssetAvailable(secondGothic.url);
    makeAssetAvailable(thirdGothic.url);
    makeAssetAvailable(secondGothic.revisionUrl, "CLOTH_CORSET_OVER");
    const thirdRevision = delayAsset(thirdGothic.revisionUrl);
    await choose(secondGothic.id);
    assert.deepEqual(rendered(), ["village gothic-skirt-02 bowtie-01"]);
    assert.deepEqual(loadedGarments.at(-1)[0], [secondGothic.url, false],
      "an override containing a corset never reaches the renderer");
    await choose(thirdGothic.id);
    await act(async () => thirdRevision(true));
    assert.deepEqual(rendered(), ["village gothic-skirt-03 bowtie-01"]);
    assert.deepEqual(loadedGarments.at(-1)[0], [thirdGothic.url, false],
      "a missing override falls back to the fitted original");
    assert.equal(status(), undefined);

    // A failed standalone corset can use the bundled garment and body.
    await act(async () => renderer.render(null));
    makeAssetAvailable("village", undefined, false);
    const standaloneUrl = "/models/characters/female/wardrobe/corsets/gothic-05.garage.glb";
    const standalone = delayAsset(standaloneUrl);
    delayAsset("/models/characters/female/wardrobe/vesper-body.glb");
    const bundleUrl = "/models/characters/wardrobe/gothic-05.garage.glb";
    const bundle = delayAsset(bundleUrl);
    const wardrobeTrial = { set: "gothic-05", shirt: "none", waist: "over" };
    await choose(undefined, undefined, { choice: { ...DEFAULT_CHARACTER, wardrobeTrial } });
    assert.equal(status(), "Loading garments");
    await act(async () => standalone(true));
    assert.equal(status(), "Loading garments");
    await act(async () => bundle());
    assert.deepEqual(loadedBodies.at(-1), [bundleUrl, bundleUrl]);
    assert.equal(status(), undefined);

    // Fresh mounts use their original context-specific loading and error states.
    await act(async () => renderer.render(null));
    const victoryBase = delayAsset("village");
    await choose(undefined, undefined, { victory: { id: "001", onFinish() {} } });
    assert(document.querySelector("[data-victory-loading]"));
    await act(async () => victoryBase());
    assert.deepEqual(rendered(), ["village bowtie-01"]);
    assert.equal(document.querySelector("[data-victory-loading]"), null);
    await act(async () => renderer.render(null));
    const cockpitBase = delayAsset("village");
    preview.setState({ insideCar: true });
    await choose(undefined, undefined, { upright: false, cockpit: {} });
    assert.equal(status(), "Loading driver");
    await act(async () => cockpitBase(true));
    assert.deepEqual(rendered(), []);
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().cockpitError, "The character model is unavailable.");
    assert.deepEqual(caught, ["Unavailable " + url("skirt-04"), "Unavailable gothic-02",
      "Unavailable " + thirdGothic.revisionUrl, "Unavailable " + standaloneUrl, "Unavailable village"]);
  } finally {
    await act(async () => renderer.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
