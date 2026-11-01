import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { Color, type Scene } from "three";
import { useEditorPalette } from "../state/editorPreferences";

function applyScenePalette(scene: Scene, backgroundColor: string, invalidate: () => void) {
  const background = scene.background, fog = scene.fog;
  scene.background = new Color(backgroundColor);
  // Authoring must stay visible at the fit-to-world camera distance.
  scene.fog = null;
  invalidate();
  return () => { scene.background = background; scene.fog = fog; invalidate(); };
}

/** Editor content is nested in a group inside the shared game canvas.
 * Set the actual scene backdrop, then restore it when leaving the editor. */
export function useEditorScenePalette() {
  const { scene, invalidate } = useThree();
  const palette = useEditorPalette();
  useLayoutEffect(() => applyScenePalette(scene, palette.background, invalidate),
    [scene, invalidate, palette.background]);
  return palette;
}
