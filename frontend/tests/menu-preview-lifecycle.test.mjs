import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

const surface = "virtual:preview-lifecycle";
const surfaceId = "\0" + surface;

function testSurfaces() {
  const retained = new Set(["react", "../FullCanvas"]);
  const stubs = {
    useSocialStore: "select => select({})",
    useBuilderStore: 'select => select({ workspace: "world" })',
    useRenderSettingsStore: "select => select({ hud: false })",
    VehiclePreview: '({ previewScreen }) => <span data-preview={previewScreen} />',
    Sandbox: "() => <span data-sandbox />",
    Cameras: "() => <span data-gameplay-camera />",
  };
  return {
    name: "preview-lifecycle-test-surfaces",
    enforce: "pre",
    transform(source, id) {
      if (id.endsWith("/game/GameUI.tsx")) {
        return source.replace(/import\("\.\/heroes\/HeroWorkshop"\)/g, 'Promise.resolve({HeroWorkshop: () => null})')
          .replace(/import\("\.\/alpha\/HeroSelection"\)/g, 'Promise.resolve({HeroSelection: () => null})')
          .replace(/^import \{([^}\n]+)\} from "([^"]+)";$/gm, (line, bindings, path) => {
          if (retained.has(path)) return line;
          if (path === "../store") return line.replace(path, "../store/menus/uiStore");
          return bindings.split(",").map(binding => {
            const name = binding.trim();
            return `const ${name} = ${stubs[name] ?? "() => null"};`;
          }).join("\n");
        });
      }
      if (id.endsWith("/FullCanvas.tsx")) {
        return source
          .replace('from "@react-three/fiber"', `from "${surface}"`)
          .replace('from "./store/menus"', 'from "./store/menus/uiStore"')
          .replace('from "./performance/PerformanceProbe"', `from "${surface}"`)
          .replace('from "./game/stats/ScoreboardSceneCover"', `from "${surface}"`);
      }
    },
    resolveId(id) { if (id === surface) return surfaceId; },
    load(id) {
      if (id === surfaceId) return `
        import { createElement } from "react";
        export const Canvas = ({children, frameloop}) =>
          createElement("section", {"data-loop": frameloop}, children);
        export const useFrame = () => {};
        export const useThree = () => {};
        export const ScoreboardSceneCover = () => null;
        export const PerformanceProbe = () => null;
      `;
    },
  };
}

test("Heroes and Play reuse one preview canvas, and Main suspends its rendering", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const globals = { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  let vite, root;
  try {
    vite = await createServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom",
      logLevel: "error",
      plugins: [testSurfaces()],
    });
    const { GameUI } = await vite.ssrLoadModule("/src/game/GameUI.tsx");
    const { useUIStore } = await vite.ssrLoadModule("/src/store/menus/uiStore.ts");
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(GameUI)));
    const canvas = () => document.querySelector("[data-loop]");
    const preview = () => document.querySelector("[data-preview]");
    const screen = next => act(async () => useUIStore.getState().setScreen(next));
    assert.equal(canvas(), null, "cold Main creates no canvas");

    await screen("heroes");
    const originalCanvas = canvas(), originalPreview = preview();
    assert.equal(originalCanvas.dataset.loop, "always");
    assert.equal(originalPreview.dataset.preview, "heroes");
    await screen("main");
    assert.equal(canvas(), originalCanvas);
    assert.equal(preview(), originalPreview);
    assert.equal(originalCanvas.dataset.loop, "never");
    assert.equal(originalCanvas.parentElement.style.visibility, "hidden");
    await screen("mode_select");
    assert.equal(canvas(), originalCanvas);
    assert.equal(preview(), originalPreview);
    assert.equal(originalCanvas.dataset.loop, "always");
    assert.equal(originalCanvas.parentElement.style.visibility, "");
    assert.equal(originalPreview.dataset.preview, "mode_select");
    await screen("queue");
    assert.equal(preview(), originalPreview);
    assert.equal(canvas().dataset.loop, "demand");

    await act(async () => useUIStore.getState().startModeLoading("main"));
    assert.equal(canvas(), null, "mode loading releases the retained preview");
    await screen("sandbox");
    assert.equal(preview(), null);
    assert.notEqual(canvas(), originalCanvas);
    assert(document.querySelector("[data-sandbox]"));
    assert(document.querySelector("[data-gameplay-camera]"));
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
