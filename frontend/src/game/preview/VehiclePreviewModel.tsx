import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import { Box3, Vector3 } from "three";
import { useSelectionStore } from "../../store/selectionStore";
import { VEHICLE_MODEL_PATHS, type VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

// Selection is always the complete GLB, independent of in-game debug modes.
// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id) as VehicleModelId;
  return <PreviewAsset key={vehicleId} model={vehicleId} path={VEHICLE_MODEL_PATHS[vehicleId]} />;
}
function PreviewAsset({ path, model }: { path: string; model: VehicleModelId }) {
  const { scene } = useGLTF(path);
  const prepared = useMemo(() => prepareVehicleVisual(scene, model), [scene, model]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  const position = useMemo(() => {
    const box = new Box3().setFromObject(prepared.root);
    if (box.isEmpty()) return [0, 0, 0] as [number, number, number];
    const center = box.getCenter(new Vector3());
    // Display placement only: keep the vehicle on the selection grid.
    return [-center.x, -box.min.y, -center.z] as [number, number, number];
  }, [prepared]);
  return <group position={position} name="selection-vehicle-glb"><primitive object={prepared.root} dispose={null} /></group>;
}
