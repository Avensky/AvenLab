import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import { useSelectionStore } from "../../store/selectionStore";
import { VEHICLE_MODEL_PATHS, type VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { measurePreviewGrounding } from "./previewPlacement";
import { PreviewContactShadow } from "./PreviewContactShadow";

// Selection is always the complete GLB, independent of in-game debug modes.
// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id) as VehicleModelId;
  return <PreviewAsset key={vehicleId} model={vehicleId} path={VEHICLE_MODEL_PATHS[vehicleId]} />;
}
function PreviewAsset({ path, model }: { path: string; model: VehicleModelId }) {
  const { scene } = useGLTF(path, '/draco/');
  const prepared = useMemo(() => prepareVehicleVisual(scene, model), [scene, model]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  const grounding = useMemo(() => measurePreviewGrounding(prepared.root), [prepared]);
  return <>
    <PreviewContactShadow footprint={grounding.footprint} />
    <group position={grounding.position} name="selection-vehicle-glb"><primitive object={prepared.root} dispose={null} /></group>
  </>;
}
