import { FACTORY_APPEARANCE, useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import { useSelectionStore } from "../../store/selection/selectionStore";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../../vehicles/tools/vehicleModelPaths";
import { fitPreviewToPlatform, measurePreviewBounds } from "./previewPlacement";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { previewMaterialState, setPreviewGhost } from "./previewGhost";
import { applyShowroomHighlights, applyShowroomPaint } from "./garageVehiclePaint";
import { prepareGarageVehiclePaint } from "./garageVehiclePaint";

// Selection is always the complete GLB, independent of in-game debug modes.
// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel({
  platform,
  ghost = false,
}: {
  platform: readonly [number, number];
  ghost?: boolean;
}) {
  const vehicleId = useSelectionStore(
    (s) => s.getSelectedVehicle().id,
  ) as VehicleModelId;
  return (
    <PreviewAsset
      key={`${vehicleId}:${ghost ? "unpicked" : "preview"}`}
      model={vehicleId}
      path={VEHICLE_MODEL_PATHS[vehicleId]}
      platform={platform}
      ghost={ghost}
    />
  );
}
function PreviewAsset({
  path,
  model,
  platform,
  ghost,
}: {
  path: string;
  model: VehicleModelId;
  platform: readonly [number, number];
  ghost: boolean;
}) {
  const savedAppearance = useHeroLoadouts(s => s.draft?.vehicle === model ? s.draft.appearance : s.loadouts[model]);
  const { scene } = useGLTF(path, "/draco/");
  const prepared = useMemo(
    () => {
      const visual = prepareVehicleVisual(scene, model);
      prepareGarageVehiclePaint(visual.root, model);
      return visual;
    },
    [scene, model],
  );
  useEffect(() => () => prepared.dispose(), [prepared]);
  useEffect(() => {
    const appearance = savedAppearance ?? FACTORY_APPEARANCE;
    applyShowroomPaint(prepared.root, model, "factory", appearance.body === "factory" ? undefined : appearance.body);
    applyShowroomHighlights(prepared.root, .45, appearance.finish);
  }, [prepared, model, savedAppearance]);
  const materials = useMemo(
    () => previewMaterialState(prepared.root),
    [prepared],
  );
  useEffect(() => {
    // These are the existing preview's owned clones, never the cached GLB or a
    // live vehicle material. A fresh hero stage has an unmistakable ghost.
    setPreviewGhost(materials, ghost);
  }, [materials, ghost]);
  // Keep the original measurements when the garage finishes loading; re-reading
  // a mounted model would measure its already-scaled parent a second time.
  const measurements = useMemo(
    () => measurePreviewBounds(prepared.root, model),
    [prepared, model],
  );
  const display = useMemo(
    () => fitPreviewToPlatform(measurements, platform),
    [measurements, platform],
  );
  return (
    <>
      <PreviewContactShadow
        footprint={display.footprint}
        offset={display.shadowOffset}
      />
      <group
        position={display.position}
        scale={display.scale}
        name="selection-vehicle-glb"
      >
        <primitive object={prepared.root} dispose={null} />
      </group>
    </>
  );
}
