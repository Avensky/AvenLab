import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { Environment, Html, Lightformer, useGLTF } from "@react-three/drei";
import { createPortal } from "@react-three/fiber";
import { Box3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3, type BufferGeometry } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Showroom, ShowroomFloor } from "./Showroom";
import { garagePlacement } from "./garagePlacement";
import { prepareGarageDisplay } from "./prepareGarageDisplay";
import { GarageGlow } from "./GarageGlow";
import { GarageFloorReflection } from "./GarageFloorReflection";
import { completeGarageStructure } from "./completeGarageStructure";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { applyGarageLighting, tagGarageAccent } from "../../theme/garageLighting";
import { createGarageReflectionSnapshot } from "./garageReflectionSnapshot";

// Vite serves files in public/ at the URL root. Presentation fixes below are
// specific to Garage Special; keep the ship out of the car selection roster.
export const GARAGE_MODEL_PATH =
  "/models/world/garage_special.glb?v=complete-1";
const GARAGE_DISPLAY_SCALE = 0.06;
type GarageProps = {
  turntable: Group | null;
  accentOverride?: string | null;
  onPlatformReady?: (footprint: [number, number]) => void;
};

export function GarageEnvironment({ turntable, onPlatformReady, accentOverride = null }: GarageProps) {
  return (
    <>
      <Showroom floor={false} />
      <GarageGlow />
      <AssetBoundary
        fallback={
          <>
            <ShowroomFloor />
            <Html fullscreen style={{ pointerEvents: "none" }}>
              <p className="absolute left-2 top-14 text-[10px] text-amber-200">
                GARAGE UNAVAILABLE — USING SHOWROOM
              </p>
            </Html>
          </>
        }
      >
        <Suspense fallback={<ShowroomFloor />}>
          <GarageModel
            turntable={turntable}
            onPlatformReady={onPlatformReady}
            accentOverride={accentOverride}
          />
        </Suspense>
      </AssetBoundary>
    </>
  );
}

function GarageModel({ turntable, onPlatformReady, accentOverride = null }: GarageProps) {
  const theme = usePreferencesStore((s) => s.theme),
    contrast = usePreferencesStore((s) => s.highContrast);
  const brightness = usePreferencesStore(
    (s) => s.garageEffects.accentBrightness,
  );
  const environmentReflections = usePreferencesStore(
    (s) => s.garageEffects.environmentReflections,
  );
  const { scene } = useGLTF(GARAGE_MODEL_PATH, "/draco/");
  const prepared = useMemo(() => {
    const display = prepareGarageDisplay(scene);
    display.root.scale.multiplyScalar(GARAGE_DISPLAY_SCALE);
    display.root.position.add(
      new Vector3(...garagePlacement(display.root, "Plane_PISTE")),
    );
    display.root.updateWorldMatrix(true, true);
    const platform = new Group();
    platform.name = "garage-display-platform";
    const pad = display.root.getObjectByName("Plane_PISTE");
    const padBounds = pad ? new Box3().setFromObject(pad, true) : null;
    const footprint = padBounds ? padBounds.getSize(new Vector3()) : null;
    const center = padBounds ? padBounds.getCenter(new Vector3()) : new Vector3();
    const floorY = padBounds ? padBounds.max.y : 0;
    const diameter = Math.max(4, Math.max(footprint?.x ?? 8, footprint?.z ?? 8) * 0.98);
    const radius = diameter / 2;
    const stageMaterials: MeshStandardMaterial[] = [];
    const stageGeometries: BufferGeometry[] = [];
    // Hide the authored rectangular pad and warning stripe rails. A procedural
    // circle keeps a clean, consistent stage without editing the source GLB.
    for (const name of ["Plane_PISTE", "RB_Tour", "RB_Tour001", "RB_Tour.001"]) {
      const part = display.root.getObjectByName(name);
      if (part) part.visible = false;
    }
    const diskGeometry = new CylinderGeometry(radius, radius, 0.06, 72);
    const diskMaterial = new MeshStandardMaterial({
      color: "#121922", metalness: 0.72, roughness: 0.28,
      envMapIntensity: 0.85,
    });
    stageGeometries.push(diskGeometry);
    stageMaterials.push(diskMaterial);
    const disk = new Mesh(diskGeometry, diskMaterial);
    disk.name = "heroes-circular-garage-platform";
    disk.position.set(center.x, floorY - 0.03 + 0.005, center.z);
    disk.receiveShadow = true;
    platform.add(disk);
    const addRing = (ringRadius: number, tube: number, color: string, emissiveIntensity: number, themed = false) => {
      const geometry = new TorusGeometry(ringRadius, tube, 8, 96);
      const material = new MeshStandardMaterial({
        color: themed ? "#07121a" : color,
        emissive: themed ? "#ffffff" : color,
        emissiveIntensity,
        metalness: 0.24,
        roughness: 0.3,
      });
      if (themed) tagGarageAccent(material);
      stageGeometries.push(geometry);
      stageMaterials.push(material);
      const mesh = new Mesh(geometry, material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(center.x, floorY + 0.012, center.z);
      mesh.name = themed ? "garage-platform-theme-light" : "garage-platform-mixed-light";
      platform.add(mesh);
    };
    addRing(radius * 0.94, 0.035, "#26dff0", 1.3, true);
    addRing(radius * 0.84, 0.018, "#ffad43", 1.0);
    addRing(radius * 0.99, 0.012, "#d8edf5", 0.75);
    // The reflective tile shader already draws this surface. Keep the full
    // grid in the exported asset, but avoid drawing 47k covered triangles here.
    if (display.root.userData.avenlabGarageComplete === true) {
      const coveredTiles = display.root.getObjectByName("Sol_CUBE");
      if (coveredTiles) coveredTiles.visible = false;
    }

    const completed = completeGarageStructure(display.root);
    // The full-plane tile overlay covers the original grey floor edging.
    // Follow the authored wall frame when restoring that perimeter finish.
    const wallFrame = display.root.getObjectByName("SEMI_Murs");
    const perimeter = wallFrame
      ? new Box3().setFromObject(wallFrame, true)
      : null;
    return {
      ...display,
      platform,
      footprint,
      platformDiameter: diameter,
      perimeter,
      structure: completed.structure,
      dispose: () => {
        completed.dispose();
        stageGeometries.forEach((geometry) => geometry.dispose());
        stageMaterials.forEach((material) => material.dispose());
        display.dispose();
      },
    };
  }, [scene]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  useLayoutEffect(() => {
    for (const root of [prepared.root, prepared.platform, prepared.structure])
      applyGarageLighting(root, theme, contrast, brightness, accentOverride);
  }, [prepared, theme, contrast, brightness, accentOverride]);
  const probe = useMemo(
    () =>
      environmentReflections
        ? createGarageReflectionSnapshot(
            [prepared.root, prepared.platform, prepared.structure],
            theme,
            contrast,
            brightness,
            accentOverride,
          )
        : null,
    [prepared, theme, contrast, brightness, environmentReflections, accentOverride],
  );
  useEffect(() => () => probe?.dispose(), [probe]);
  // Stable JSX prevents a hero hover or unrelated menu render from triggering
  // another six-face capture in Environment's children-dependent layout effect.
  const reflectionEnvironment = useMemo(
    () =>
      probe && (
      <Environment resolution={128} frames={1}>
          <group position={[0, -2.2, 0]}>
            <primitive object={probe.root} dispose={null} />
            <hemisphereLight args={["#e2e6ed", "#242936", 0.65]} />
            <directionalLight
              position={[-6, 8, -4]}
              color="#f0f4ff"
              intensity={1}
            />
          </group>
          <Lightformer
            form="rect"
            intensity={1}
            position={[0, 6, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[3, 8, 1]}
          />
          <Lightformer
            form="rect"
            color="#d8e2f0"
            intensity={0.35}
            position={[0, 3, -6]}
            scale={[8, 0.1, 1]}
          />
          <Lightformer
            form="rect"
            color="#e9eef5"
            intensity={0.65}
            position={[-6, 3, 0]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[8, 0.2, 1]}
          />
        </Environment>
      ),
    [probe],
  );
  const footprint = prepared.footprint;
  useEffect(() => {
    if (prepared.platformDiameter) onPlatformReady?.([prepared.platformDiameter, prepared.platformDiameter]);
  }, [prepared.platformDiameter, onPlatformReady]);
  return (
    <>
      <group name="garage-special-environment">
        <primitive object={prepared.root} dispose={null} />
        <primitive object={prepared.structure} dispose={null} />
      </group>
      {turntable &&
        createPortal(
          <>
            <primitive object={prepared.platform} dispose={null} />
          </>,
          turntable,
        )}
      {footprint && (
        <GarageFloorReflection
          width={prepared.platformDiameter}
          depth={prepared.platformDiameter}
          turntable={turntable}
          perimeter={prepared.perimeter}
        />
      )}
      {/* One small, generated reflection map. No HDRI fetch or per-frame cube capture. */}
      {reflectionEnvironment}
    </>
  );
}
