import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

function wardrobePreviewServer(modelFallbacks = {}) {
  return createServer({
    define: {
      __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(["skirt-01", "skirt-02", "skirt-03", "skirt-04", "gothic-skirt-02", "gothic-skirt-03", "gothic-skirt-04", "bowtie-01"]),
      __DRESSING_ROOM_MOBILE_IDS__: JSON.stringify(["hat-01"]),
      __DRESSING_ROOM_REVISION_IDS__: JSON.stringify(["gothic-skirt-02", "gothic-skirt-03"]),
      __STANDALONE_CORSET_LODS__: JSON.stringify({
        "gothic-05": { garage: true, mobile: false },
        "gothic-laced-bodice": { garage: true, mobile: true },
      }),
      __BUNDLED_WARDROBE_LODS__: JSON.stringify({
        "gothic-05": { garage: true, mobile: false },
        "gothic-01": { garage: true, mobile: true },
      }),
      __VILLAGER_MODEL_URL__: JSON.stringify("village-full"),
      __VILLAGER_PORTRAIT_URL__: JSON.stringify("village"),
      __CHARACTER_MODEL_FALLBACKS__: JSON.stringify(modelFallbacks),
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
          import { Bone, BufferGeometry, Float32BufferAttribute, Group, Skeleton, SkinnedMesh, Uint16BufferAttribute } from "three";

          const assets = new Map(), invalidate = () => {};
          export const prepared = [], committed = [], appliedLooks = [], loadedGarments = [], loadedBodies = [];
          export const assetReads = [];
          export const useThree = selector => selector({ size: { width: 1200 }, invalidate });
          export const Html = ({ children }) => children;
          export const CharacterTurntable = ({ children }) => children;
          export const CharacterLoadingEffect = () => createElement("span", { "data-victory-loading": true });
          export const PreviewLoadingStatus = ({ label }) => createElement("span", { role: "status" }, label);
          export const StylizedDriver = () => null;
          export const villagerModelUrl = (look, kind, villageKind = kind) => look.wardrobe?.set ?? (villageKind === "portrait" ? "village" : "village-full");
          export const applyVillagerLook = (model, look) => { appliedLooks.push(look); };

          function fixtureMesh(name, shape = "full") {
            if (shape === "group") {
              const group = new Group();
              group.name = name;
              return group;
            }
            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
            if (shape !== "no-skin") {
              geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4));
              geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
            }
            if (shape !== "non-indexed") geometry.setIndex([0, 1, 2]);
            const hip = new Bone(), spine = new Bone();
            hip.name = "hip";
            spine.name = "spine";
            hip.add(spine);
            const body = new SkinnedMesh(geometry);
            body.name = name;
            body.add(hip);
            body.bind(new Skeleton(shape === "reordered" ? [spine, hip] : [hip, spine]));
            return body;
          }
          export function makeAssetAvailable(url, bodyShape = "full") {
            const scene = new Group();
            scene.name = url;
            if (bodyShape) scene.add(fixtureMesh(bodyShape === "cut" ? "BODY_OUTFIT_CUT" : "BODY_WARDROBE", bodyShape));
            assets.set(url, { scene });
            return scene;
          }
          export function makeVillageAvailable(url, bodyShape = "full") {
            const scene = makeAssetAvailable(url, bodyShape);
            scene.add(fixtureMesh("CLOTH_BOTTOM_SKIRT"));
            return scene;
          }
          export function makeGarmentAvailable(url, { name = "CLOTH_GARMENT", shape, lining = false, excluded = false } = {}) {
            const scene = makeAssetAvailable(url, false);
            const mesh = fixtureMesh(name, shape);
            if (lining) mesh.userData.wardrobeRole = "shorts";
            if (excluded) mesh.material.userData.runtimeExclude = true;
            scene.add(mesh);
            return scene;
          }
          export function makeCorsetAvailable(url, { authored = false, donor = false, tuckedShape } = {}) {
            const scene = makeAssetAvailable(url, donor);
            for (const waist of ["over", "tucked"]) {
              const part = fixtureMesh("CLOTH_CORSET_" + waist.toUpperCase(), waist === "tucked" ? tuckedShape : undefined);
              part.userData = { authoredFit: authored, wardrobeRole: "corset-" + waist };
              scene.add(part);
            }
            return scene;
          }
          export function delayAsset(url, create = () => makeAssetAvailable(url)) {
            let resolve;
            const promise = new Promise(ready => { resolve = ready; });
            assets.set(url, { promise });
            return (fail = false) => {
              if (fail) assets.set(url, { error: new Error("Unavailable " + url) });
              else create();
              resolve();
            };
          }
          export function useGLTF(url) {
            assetReads.push(url);
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

test("the wardrobe resolver requests donors and authored tiers in order", async () => {
  const vite = await wardrobePreviewServer({ village: "village-raw" });
  try {
    const { resolveWardrobePreview } = await vite.ssrLoadModule("/src/game/characters/wardrobePreviewAssets.ts");
    const { characterLook, DEFAULT_CHARACTER } = await vite.ssrLoadModule("/src/game/characters/characterCatalog.ts");
    const { getWardrobeGarment } = await vite.ssrLoadModule("/src/game/characters/wardrobeGarments.ts");
    const { WARDROBE_BODY_DONOR_URLS: [FITTING_BODY_URL] } = await vite.ssrLoadModule("/src/game/characters/wardrobeBody.ts");
    const { makeAssetAvailable, makeVillageAvailable, makeGarmentAvailable, makeCorsetAvailable } =
      await vite.ssrLoadModule("virtual:wardrobe-preview");
    const village = makeVillageAvailable("village", "cut");
    const defaultRequest = { preferredUrl: "village", villageKind: "portrait", kind: "garage" };
    const previous = resolveWardrobePreview({
      ...defaultRequest, look: characterLook(DEFAULT_CHARACTER), sources: { village },
    }).preview;
    assert(previous);

    const stockSkirt = characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: "village-skirt" } });
    const originalPortrait = makeVillageAvailable("village-raw");
    for (const kind of ["garage", "portrait"]) {
      const next = sources => resolveWardrobePreview({ ...defaultRequest, kind, look: stockSkirt, sources });
      assert.deepEqual(next({}).pendingUrls, ["village"]);
      assert.deepEqual(next({ village: originalPortrait }).pendingUrls, [], "a working packed portrait never requests the original");
      assert.deepEqual(next({ village: null }).pendingUrls, ["village-raw"]);
      const loaded = next({ village: null, "village-raw": originalPortrait });
      assert.deepEqual(loaded.pendingUrls, []);
      assert.equal(loaded.preview.scene, originalPortrait);
      assert.equal(loaded.preview.garments[0].scene, originalPortrait, "the actor and stock skirt reuse the original portrait");
      const exhausted = next({ village: null, "village-raw": null });
      assert.deepEqual(exhausted.pendingUrls, kind === "garage" ? ["village-full"] : []);
      if (kind === "portrait") assert.equal(exhausted.unavailable, true);
    }

    const hat = getWardrobeGarment("hat-01");
    const hatLook = characterLook({ ...DEFAULT_CHARACTER, garments: { hat: hat.id } });
    const mobileHat = makeGarmentAvailable(hat.mobileUrl);
    for (const kind of ["garage", "portrait"]) {
      const request = { ...defaultRequest, kind, look: hatLook, previous };
      assert.deepEqual(resolveWardrobePreview({ ...request, sources: { village } }).pendingUrls, [hat.mobileUrl]);
      const resolved = resolveWardrobePreview({ ...request, sources: { village, [hat.mobileUrl]: mobileHat } });
      assert.deepEqual(resolved.pendingUrls, []);
      assert.equal(resolved.preview.garments[0].scene, mobileHat);
    }

    const skirt = getWardrobeGarment("skirt-01");
    const look = characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: skirt.id } });
    const legacyUrl = "/models/characters/wardrobe/gothic-02.mobile.glb";
    const legacy = makeAssetAvailable(legacyUrl);
    const skirtSources = { village, [skirt.url]: makeGarmentAvailable(skirt.url) };
    const resolveSkirt = sources => resolveWardrobePreview({ ...defaultRequest, look, sources, previous });
    assert.deepEqual(resolveSkirt(skirtSources).pendingUrls, [FITTING_BODY_URL]);
    const baseWithGroup = makeVillageAvailable("village-with-group", "cut");
    baseWithGroup.add(makeAssetAvailable("body-group", "group").getObjectByName("BODY_WARDROBE"));
    assert.deepEqual(resolveSkirt({ ...skirtSources, village: baseWithGroup }).pendingUrls, [FITTING_BODY_URL],
      "a named group on the actor does not override the cut body rig");
    const noActorRig = resolveSkirt({ ...skirtSources, village: makeAssetAvailable("no-actor-rig", "group") });
    assert.deepEqual(noActorRig.pendingUrls, [], "an actor without a body rig cannot use a donor");
    assert.equal(noActorRig.unavailable, true);
    assert.equal(noActorRig.preview, previous);
    for (const [label, rejectedDonor] of [
      ["failed load", null],
      ...[false, "group", "non-indexed", "no-skin", "reordered"].map(shape =>
        [shape || "missing body", makeAssetAvailable(FITTING_BODY_URL, shape)]),
    ]) {
      const sources = { ...skirtSources, [FITTING_BODY_URL]: rejectedDonor };
      const loading = resolveSkirt(sources);
      assert.deepEqual(loading.pendingUrls, [legacyUrl], label + " requests the legacy donor");
      assert.equal(loading.preview, previous);
      const resolved = resolveSkirt({ ...sources, [legacyUrl]: legacy });
      assert.equal(resolved.preview.garmentBody, legacy.getObjectByName("BODY_WARDROBE"));
      assert.deepEqual(resolved.preview.garments.map(({ item }) => item.id), [skirt.id]);
      const failed = resolveSkirt({ ...sources, [legacyUrl]: null });
      assert.deepEqual(failed.pendingUrls, []);
      assert.equal(failed.unavailable, true);
      assert.equal(failed.preview, previous);
      const fresh = resolveWardrobePreview({ ...defaultRequest, look, sources: { ...sources, [legacyUrl]: null } });
      assert.deepEqual(fresh.preview.garments, [], "missing donors leave the stock clothing on a fresh preview");
    }
    const stockWithDonor = { ...skirtSources, [FITTING_BODY_URL]: legacy };
    for (const [label, garment] of [
      ["incompatible rig", makeGarmentAvailable(skirt.url, { shape: "reordered" })],
      ["excluded material", makeGarmentAvailable(skirt.url, { excluded: true })],
      ["no skinned mesh", makeAssetAvailable(skirt.url, false)],
    ]) {
      const sources = { ...skirtSources, [skirt.url]: garment };
      const rejected = resolveSkirt(sources);
      assert.deepEqual(rejected.pendingUrls, [], label + " does not request a donor");
      assert.equal(rejected.unavailable, true, label);
      assert.equal(rejected.preview, previous, label);
      assert.deepEqual(resolveWardrobePreview({ ...defaultRequest, look, sources }).preview.garments, [], label);
    }
    const mixedGarment = makeGarmentAvailable(skirt.url, { shape: "reordered" });
    mixedGarment.add(makeGarmentAvailable("compatible-panel").getObjectByName("CLOTH_GARMENT"));
    const mixedFit = resolveSkirt({ ...stockWithDonor, [skirt.url]: mixedGarment });
    assert.equal(mixedFit.unavailable, false, "one compatible garment panel is enough to render the selection");
    assert.equal(mixedFit.preview.garments[0].scene, mixedGarment);

    const lining = getWardrobeGarment("gothic-skirt-04");
    const liningOnly = resolveWardrobePreview({
      ...defaultRequest, previous, look: characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: lining.id } }),
      sources: { ...stockWithDonor, [lining.url]: makeGarmentAvailable(lining.url, { lining: true }) },
    });
    assert.equal(liningOnly.unavailable, true, "lining that the fitter ignores does not make a skirt ready");
    assert.equal(liningOnly.preview, previous);
    const revised = getWardrobeGarment("gothic-skirt-02");
    const wrongPiece = resolveWardrobePreview({
      ...defaultRequest, previous, look: characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: revised.id } }),
      sources: { ...stockWithDonor, [revised.revisionUrl]: makeGarmentAvailable(revised.revisionUrl, { name: "CLOTH_CORSET_OVER" }) },
    });
    assert.deepEqual(wrongPiece.pendingUrls, [revised.url], "a revision containing a corset falls back to the original skirt");
    assert.equal(wrongPiece.preview, previous);
    const correctRevision = resolveWardrobePreview({
      ...defaultRequest, previous, look: characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: revised.id } }),
      sources: { ...stockWithDonor, [revised.revisionUrl]: makeGarmentAvailable(revised.revisionUrl, { name: "CLOTH_GOTHIC_SKIRT_02" }) },
    });
    assert.equal(correctRevision.preview.garments[0].authoredFit, true, "a compatible revision remains preferred");
    assert.deepEqual(correctRevision.pendingUrls, []);

    const trial = characterLook({
      ...DEFAULT_CHARACTER, wardrobeTrial: { set: "gothic-01", shirt: "none", waist: "tucked" },
    });
    const authored = tier => `/models/characters/female/wardrobe/corsets/gothic-laced-bodice.${tier}.glb`;
    for (const [kind, tier, otherTier] of [["garage", "garage", "mobile"], ["portrait", "mobile", "garage"]]) {
      const preferred = authored(tier), alternate = authored(otherTier);
      const bundleUrl = `/models/characters/wardrobe/gothic-01.${tier}.glb`;
      const request = { ...defaultRequest, kind, look: trial, previous };
      const resolve = sources => resolveWardrobePreview({ ...request, sources });
      assert.deepEqual(resolve({ village, [FITTING_BODY_URL]: legacy }).pendingUrls, [preferred]);
      const sources = { village, [preferred]: makeCorsetAvailable(preferred, { authored: true, tuckedShape: "reordered" }),
        [FITTING_BODY_URL]: legacy };
      const awaitingAlternate = resolve(sources);
      assert.deepEqual(awaitingAlternate.pendingUrls, [alternate], "the authored fit marker does not bypass rig validation");
      assert.equal(awaitingAlternate.preview, previous);
      const alternateScene = makeCorsetAvailable(alternate, { authored: true });
      assert.equal(resolve({ ...sources, [alternate]: alternateScene }).preview.corsetScene, alternateScene);
      const awaitingBundle = resolve({ village, [preferred]: null, [alternate]: null });
      assert.deepEqual(awaitingBundle.pendingUrls, [bundleUrl], "a pending bundle can supply the donor");
      assert.equal(awaitingBundle.preview, previous);
      const bundle = makeCorsetAvailable(bundleUrl, { donor: "full" });
      const bundled = resolve({ village, [preferred]: null, [alternate]: null, [bundleUrl]: bundle });
      assert.equal(bundled.preview.garmentBody, bundle.getObjectByName("BODY_WARDROBE"));
      assert.equal(bundled.preview.corsetScene, bundle);
      assert.deepEqual(bundled.pendingUrls, []);

      const incompatibleBundle = makeCorsetAvailable(bundleUrl, { donor: "reordered" });
      const incompatibleSources = { village, [preferred]: null, [alternate]: null, [bundleUrl]: incompatibleBundle };
      const waitingForDonor = resolve(incompatibleSources);
      assert.deepEqual(waitingForDonor.pendingUrls, [FITTING_BODY_URL], "a bundled body with different bone order requires a separate donor");
      assert.equal(waitingForDonor.preview, previous);
      const recovered = resolve({ ...incompatibleSources, [FITTING_BODY_URL]: legacy });
      assert.equal(recovered.preview.garmentBody, legacy.getObjectByName("BODY_WARDROBE"));
      assert.deepEqual(recovered.pendingUrls, []);
    }
  } finally {
    await vite.close();
  }
});

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
    const { committed, prepared, appliedLooks, loadedGarments, loadedBodies, assetReads,
      makeAssetAvailable, makeVillageAvailable, makeGarmentAvailable, makeCorsetAvailable, delayAsset } =
      await vite.ssrLoadModule("virtual:wardrobe-preview");
    const url = id => getWardrobeGarment(id).url;
    makeVillageAvailable("village");
    makeGarmentAvailable(url("skirt-01"));
    makeGarmentAvailable(url("bowtie-01"));
    const second = delayAsset(url("skirt-02"), () => makeGarmentAvailable(url("skirt-02")));
    const third = delayAsset(url("skirt-03"), () => makeGarmentAvailable(url("skirt-03")));
    const fourth = delayAsset(url("skirt-04"));
    const incompatibleSkirt = url("gothic-skirt-04");
    const incompatible = delayAsset(incompatibleSkirt, () => makeGarmentAvailable(incompatibleSkirt, { shape: "reordered" }));
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
    assetReads.length = 0;
    await choose("skirt-02");
    await choose("skirt-03");
    assert.equal(model(), firstModel);
    assert.equal(status(), "Loading garments");
    assert.deepEqual(new Set(assetReads), new Set([url("skirt-02"), url("skirt-03")]),
      "choosing another skirt reads the pending assets and reuses the base and bow sources");
    await act(async () => third());
    assert.deepEqual(rendered(), ["village skirt-03 bowtie-01"]);
    const thirdModel = model();
    await act(async () => second());
    assert.equal(model(), thirdModel, "a late result does not rebuild or replace the latest outfit");

    await choose("gothic-skirt-04");
    assert.equal(status(), "Loading garments");
    await act(async () => incompatible());
    assert.equal(model(), thirdModel, "a GLB that loads without a compatible garment cannot replace the visible outfit");
    assert.equal(status(), "Garment unavailable");

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

    const removedHat = { ...DEFAULT_CHARACTER, garments: { skirt: "skirt-03", bow: "bowtie-01" }, removedClothing: ["hat"] };
    await choose("skirt-03", undefined, { choice: removedHat });
    const withoutHat = model();
    assert.notEqual(withoutHat, thirdModel, "changing a removal prepares the revised outfit");
    assetReads.length = 0;
    await choose("skirt-03", undefined, { choice: {
      ...removedHat, removedClothing: ["hat"], appearance: { ...DEFAULT_CHARACTER.appearance, color: "#826911" },
    } });
    assert.equal(model(), withoutHat, "redyeing an equivalent fit keeps the same skinned character");
    assert.equal(appliedLooks.at(-1).appearance.color, "#826911", "the new dye still reaches the mounted rig");
    assert.deepEqual(assetReads, [], "redyeing leaves the completed asset loaders unmounted");

    const secondGothic = getWardrobeGarment("gothic-skirt-02");
    const thirdGothic = getWardrobeGarment("gothic-skirt-03");
    makeGarmentAvailable(secondGothic.url);
    makeGarmentAvailable(thirdGothic.url);
    makeGarmentAvailable(secondGothic.revisionUrl, { name: "CLOTH_GOTHIC_SKIRT_02", shape: "reordered" });
    const thirdRevision = delayAsset(thirdGothic.revisionUrl);
    await choose(secondGothic.id);
    assert.deepEqual(rendered(), ["village gothic-skirt-02 bowtie-01"]);
    assert.deepEqual(loadedGarments.at(-1)[0], [secondGothic.url, false],
      "a named override on a different rig falls back to the fitted original");
    await choose(thirdGothic.id);
    await act(async () => thirdRevision(true));
    assert.deepEqual(rendered(), ["village gothic-skirt-03 bowtie-01"]);
    assert.deepEqual(loadedGarments.at(-1)[0], [thirdGothic.url, false],
      "a missing override falls back to the fitted original");
    assert.equal(status(), undefined);

    // A failed standalone corset can use the bundled garment and body.
    await act(async () => renderer.render(null));
    makeVillageAvailable("village", "cut");
    const standaloneUrl = "/models/characters/female/wardrobe/corsets/gothic-05.garage.glb";
    const standalone = delayAsset(standaloneUrl);
    delayAsset("/models/characters/female/wardrobe/vesper-body.glb");
    const bundleUrl = "/models/characters/wardrobe/gothic-05.garage.glb";
    const bundle = delayAsset(bundleUrl, () => makeCorsetAvailable(bundleUrl, { donor: "full" }));
    const wardrobeTrial = { set: "gothic-05", shirt: "none", waist: "over" };
    await choose(undefined, undefined, { choice: { ...DEFAULT_CHARACTER, wardrobeTrial } });
    assert.equal(status(), "Loading garments");
    await act(async () => standalone(true));
    assert.equal(status(), "Loading garments");
    await act(async () => bundle());
    assert.deepEqual(loadedBodies.at(-1), [bundleUrl, bundleUrl]);
    assert.equal(status(), undefined);

    // Keep the stock actor mounted until a compatible donor replaces the rejected ones.
    await act(async () => renderer.render(null));
    const fittingBodyUrl = "/models/characters/female/wardrobe/vesper-body.glb";
    const fittingBody = delayAsset(fittingBodyUrl, () => makeAssetAvailable(fittingBodyUrl, "non-indexed"));
    const legacyBodyUrl = "/models/characters/wardrobe/gothic-02.mobile.glb";
    const legacyBody = delayAsset(legacyBodyUrl);
    const lacedBundleUrl = "/models/characters/wardrobe/gothic-01.garage.glb";
    for (const tier of ["garage", "mobile"]) {
      makeAssetAvailable("/models/characters/female/wardrobe/corsets/gothic-laced-bodice." + tier + ".glb", false);
    }
    makeCorsetAvailable(lacedBundleUrl, { donor: "reordered" });
    await choose(undefined, undefined, { choice: DEFAULT_CHARACTER });
    const stockModel = model();
    assert(stockModel);
    await choose(undefined, undefined, { choice: { ...DEFAULT_CHARACTER, wardrobeTrial: { ...wardrobeTrial, set: "gothic-01" } } });
    assert.equal(status(), "Loading garments");
    assert.equal(model(), stockModel);
    await act(async () => fittingBody());
    assert.equal(status(), "Loading garments");
    assert.equal(model(), stockModel);
    await act(async () => legacyBody());
    assert.deepEqual(loadedBodies.at(-1), [legacyBodyUrl, lacedBundleUrl]);
    assert.notEqual(model(), stockModel);
    assert.equal(status(), undefined);

    // Fresh mounts use their original context-specific loading and error states.
    await act(async () => renderer.render(null));
    const victoryBase = delayAsset("village-full", () => makeVillageAvailable("village-full"));
    await choose(undefined, undefined, { victory: { id: "001", onFinish() {} } });
    assert(document.querySelector("[data-victory-loading]"));
    await act(async () => victoryBase());
    assert.deepEqual(rendered(), ["village-full bowtie-01"]);
    assert.equal(document.querySelector("[data-victory-loading]"), null);
    await act(async () => renderer.render(null));
    const menuBase = delayAsset("village");
    await choose(undefined, undefined, { choice: { ...DEFAULT_CHARACTER, garments: { skirt: "village-skirt" } } });
    assert.equal(status(), "Loading driver");
    await act(async () => menuBase(true));
    assert.deepEqual(rendered(), ["village-full village-skirt"]);
    assert.deepEqual(loadedGarments.at(-1), [["village-full", false]], "the Village piece uses the same fallback model");
    assert.equal(status(), undefined);
    await act(async () => renderer.render(null));
    const cockpitBase = delayAsset("village");
    const cockpitFallback = delayAsset("village-full");
    preview.setState({ insideCar: true });
    await choose(undefined, undefined, { upright: false, cockpit: {} });
    assert.equal(status(), "Loading driver");
    await act(async () => cockpitBase(true));
    assert.equal(status(), "Loading driver");
    await act(async () => cockpitFallback(true));
    assert.deepEqual(rendered(), []);
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().cockpitError, "The character model is unavailable.");
    assert.deepEqual(caught, ["Unavailable " + url("skirt-04"), "Unavailable gothic-02",
      "Unavailable " + thirdGothic.revisionUrl, "Unavailable " + standaloneUrl, "Unavailable village",
      "Unavailable village", "Unavailable village-full"]);
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
