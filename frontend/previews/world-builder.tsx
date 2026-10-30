import { createRoot } from "react-dom/client";
import { WorldBuilderPanel } from "../src/worldBuilder/panels/WorldBuilderPanel";
import {
  useBuilderStore,
  configurePreviewStorage,
} from "../src/worldBuilder/state/builderStore";
import {
  editableBoxes,
  parseMapDocument,
} from "../src/worldBuilder/document/mapDocument";
import { useWorldStore } from "../src/store/world/worldStore";
import { useUIStore } from "../src/store/menus/uiStore";
import { Keyboard } from "../src/controls/Keyboard";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import WorldBuilderScene from "../src/worldBuilder/scene/WorldBuilderScene";
import {
  configureLayoutPreview,
  useLayoutStore,
} from "../src/worldBuilder/state/layoutStore";
import { exampleLayout } from "../src/worldBuilder/document/layoutDocument";
import source from "../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json";
configurePreviewStorage();
configureLayoutPreview();
const doc = parseMapDocument(source);
const style = document.createElement("style");
style.textContent =
  "html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#162b27}.preview-canvas{position:fixed;inset:0}#preview-exit{display:none;position:fixed;inset:0;place-items:center;color:#d5e5bd;font:14px system-ui}#preview-exit button{background:#20382b;color:#d5e5bd;padding:12px;border:1px solid #91af7b;border-radius:6px}";
document.head.append(style);
useWorldStore
  .getState()
  .setMap({
    ...doc,
    layout: { kind: "fixed_grid", origin: [0, 0], size: [3, 3] },
    chunks: [{ x: 0, z: 0, origin: [0, 0, 0] }],
    collider_chunks: [
      {
        x: 0,
        z: 0,
        boxes: editableBoxes(doc).map((b) => ({
          id: b.id,
          kind: b.kind,
          center: b.center,
          half_extents: b.half,
          visual: b.visual,
        })),
      },
    ],
  });
useUIStore.setState({
  screen: "world_builder",
  overlay: null,
  isModeLoading: false,
});
useBuilderStore
  .getState()
  .load(doc, "OFFLINE PREVIEW · Current map source · No Rust simulation");
useLayoutStore
  .getState()
  .initialize(doc.map_id, exampleLayout(doc.map_id, doc.surface.road_y));
const root = createRoot(document.getElementById("root")!);
root.render(
  <>
    <div className="preview-canvas">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [60, 60, 60], fov: 42 }}
        gl={{ antialias: true }}
        fallback={<div>Choose Plan to edit without WebGL.</div>}
      >
        <Suspense fallback={null}>
          <WorldBuilderScene />
        </Suspense>
      </Canvas>
    </div>
    <Keyboard />
    <WorldBuilderPanel modelReference={false} />
  </>,
);
const exit = document.createElement("div");
exit.id = "preview-exit";
exit.innerHTML =
  "<div>PREVIEW CLOSED · Draft kept in this tab<br><br><button>REOPEN WORLD BUILDER</button></div>";
document.body.append(exit);
exit.querySelector("button")!.onclick = () =>
  useUIStore.setState({ screen: "world_builder", overlay: null });
useUIStore.subscribe((s) => {
  const show = s.screen === "world_builder";
  document.getElementById("root")!.style.display = show ? "block" : "none";
  exit.style.display = show ? "none" : "grid";
});
Object.assign(window, {
  worldBuilderQA: {
    builder: useBuilderStore,
    layout: useLayoutStore,
    ui: useUIStore,
    world: useWorldStore,
  },
});
