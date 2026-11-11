import { useLayoutEffect, useMemo, useRef } from "react";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, MOUSE, TOUCH, Vector3, type Group, type Object3D, type PerspectiveCamera as Camera } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { GarageDriver } from "../../game/characters/GarageDriver";
import { useCharacterPreviewStore } from "../../game/characters/characterPreviewStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useEditorScenePalette } from "../scene/useEditorScenePalette";
import { characterFrame } from "./characterFraming";
import { useCharacterEditorStore } from "./characterEditorStore";

export default function CharacterEditorScene() {
  const { choice, shot, revision, panelsHidden, viewport, zoomSteps } = useCharacterEditorStore();
  const paused = useCharacterPreviewStore(s => s.playbackPaused);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const palette = useEditorScenePalette();
  const { size, invalidate } = useThree();
  const actor = useRef<Group>(null), camera = useRef<Camera>(null), controls = useRef<Controls>(null);
  const measured = useRef<Object3D | null>(null), pendingFrame = useRef(true);
  const previousZoom = useRef(zoomSteps);
  const bounds = useMemo(() => new Box3(), []), center = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => {
    pendingFrame.current = true;
    invalidate();
  }, [size.width, size.height, panelsHidden, viewport, invalidate]);
  useLayoutEffect(() => { pendingFrame.current = true; invalidate(); }, [shot, revision, invalidate]);
  useLayoutEffect(() => { measured.current = null; invalidate(); }, [choice.id, choice.outfit, choice.wardrobe?.set, invalidate]);
  useLayoutEffect(() => { invalidate(); }, [paused, reducedMotion, invalidate]);
  useLayoutEffect(() => {
    const steps = zoomSteps - previousZoom.current;
    previousZoom.current = zoomSteps;
    if (!steps || !controls.current) return;
    if (steps > 0) controls.current.dollyIn(.82 ** steps);
    else controls.current.dollyOut(.82 ** -steps);
    controls.current.update();
    invalidate();
  }, [zoomSteps, invalidate]);

  useFrame(() => {
    const model = actor.current?.getObjectByName("garage-driver");
    if (model && measured.current !== model) {
      model.updateWorldMatrix(true, true);
      bounds.setFromObject(model);
      measured.current = model;
      pendingFrame.current = true;
    }
    if (pendingFrame.current && measured.current && camera.current && controls.current && !bounds.isEmpty()) {
      const area = panelsHidden || !viewport?.width ? null : viewport;
      const width = area?.width || size.width, height = area?.height || size.height;
      const framing = characterFrame(shot, bounds.max.y - bounds.min.y, width / Math.max(1, height));
      bounds.getCenter(center);
      center.y = bounds.min.y + framing.center;
      const distance = framing.distance * size.height / Math.max(1, height);
      camera.current.position.set(center.x + Math.sin(framing.angle) * distance, center.y, center.z + Math.cos(framing.angle) * distance);
      camera.current.setViewOffset(size.width, size.height,
        area ? size.width / 2 - (area.left + width / 2) : 0,
        area ? size.height / 2 - (area.top + height / 2) : 0, size.width, size.height);
      controls.current.target.copy(center);
      controls.current.update();
      pendingFrame.current = false;
    }
    // One shared, demand-rendered canvas. Frozen fitting views have no animation loop.
    if (!paused && !reducedMotion) invalidate();
  });
  return <group name="character-editor-scene">
    <hemisphereLight args={["#f4f7ff", "#6c657a", 2]} />
    <directionalLight position={[3, 4, 5]} intensity={2.2} />
    <directionalLight position={[-3, 2, -3]} intensity={1.6} />
    <PerspectiveCamera ref={camera} makeDefault fov={35} near={.01} far={100} position={[0, .9, 4]} />
    <OrbitControls ref={controls} makeDefault enablePan screenSpacePanning enableDamping={false}
      minDistance={.12} maxDistance={15} minPolarAngle={.04} maxPolarAngle={Math.PI - .04}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} />
    <gridHelper args={[6, 30, palette.axis, palette.grid]} position={[0, -.015, 0]} />
    <group ref={actor}><GarageDriver choice={choice} previewPacks upright /></group>
  </group>;
}
