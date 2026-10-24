import { useMemo } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import { useSelectionStore } from "../../store/selectionStore";
import { VEHICLE_MODEL_PATHS, type VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

// Selection is always the complete GLB, independent of in-game debug modes.
// A plain clone also avoids network poses and extracted runtime wheel rigs.
export function VehiclePreviewModel() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id) as VehicleModelId;
  return <PreviewAsset key={vehicleId} path={VEHICLE_MODEL_PATHS[vehicleId]} />;
}
function PreviewAsset({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  const position = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    if (box.isEmpty()) return [0, 0, 0] as [number, number, number];
    const center = box.getCenter(new Vector3());
    // Display placement only: keep the vehicle on the selection grid.
    return [-center.x, -box.min.y, -center.z] as [number, number, number];
  }, [scene]);
  return <group position={position} name="selection-vehicle-glb"><Clone object={scene} /></group>;
}
