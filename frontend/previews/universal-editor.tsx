import { ThemeController } from "../src/theme";
import { sourceSpawns } from "../src/worldBuilder/document/spawnDocument";
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { WorldBuilderPanel } from "../src/worldBuilder/panels/WorldBuilderPanel";
import WorldBuilderScene from "../src/worldBuilder/scene/WorldBuilderScene";
import {
  configurePreviewStorage,
  useBuilderStore,
} from "../src/worldBuilder/state/builderStore";
import {
  configureLayoutPreview,
  useLayoutStore,
} from "../src/worldBuilder/state/layoutStore";
import { configureBuilderMapSources } from "../src/worldBuilder/state/builderActions";
import { parseMapDocument } from "../src/worldBuilder/document/mapDocument";
import { useUIStore } from "../src/store/menus/uiStore";
import { useWorldStore } from "../src/store/world/worldStore";
import { useEditorPreferences } from "../src/worldBuilder/state/editorPreferences";
import { Keyboard } from "../src/controls/Keyboard";
import city from "../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json";
import jump from "../../avenlab-server/src/assets/blocks/road_jump_lab_colliders.json";
import yard from "../../avenlab-server/src/assets/blocks/workshop_yard_colliders.json";
import road from "../../avenlab-server/src/assets/blocks/road_precision_colliders.json";

configurePreviewStorage();
configureLayoutPreview();
configureBuilderMapSources(
  [city, jump, yard, road].map((v) => parseMapDocument(v)),
);
const source = parseMapDocument(yard);
useUIStore.setState({
  screen: "world_builder",
  overlay: null,
  isModeLoading: false,
});
useBuilderStore
  .getState()
  .load(source, "Authoring preview · physics runs in Rust");
useLayoutStore
  .getState()
  .initialize(source.map_id, source.authored_layout, sourceSpawns(source));
const style = document.createElement("style");
style.textContent =
  "html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#050c18}.preview-canvas{position:fixed;inset:0}";
document.head.append(style);
createRoot(document.getElementById("root")!).render(
  <>
    <ThemeController />
    <div className="preview-canvas">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        onCreated={({ gl, scene, camera }) =>
          Object.assign(window, { editorRenderQA: { gl, scene, camera } })
        }
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
Object.assign(window, {
  worldBuilderQA: {
    builder: useBuilderStore,
    layout: useLayoutStore,
    ui: useUIStore,
    world: useWorldStore,
    preferences: useEditorPreferences,
  },
});
