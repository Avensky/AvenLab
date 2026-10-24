import { useSelectionStore } from "../../store";
import { useWorldStore } from "../../store/worldStore";
import { Ae86, Brz, Camaro, Supra, Tank } from "../../vehicles";

export function VehiclePreviewModel() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id);
  const mode = useWorldStore((s) => s.mode);
  // Selection preview is a placeholder; accurate collision geometry arrives at spawn.
  if (mode === "collider" || mode === "geometry") return <mesh position={[0, 0.6, 0]}>
    <boxGeometry args={[1.8, 0.7, 4.2]} /><meshBasicMaterial color="#38bdf8" wireframe={mode === "collider"} />
  </mesh>;
  return (
    <>
      {vehicleId === "ae86"   && <Ae86 />}
      {vehicleId === "brz"    && <Brz />}
      {vehicleId === "camaro" && <Camaro />}
      {vehicleId === "supra"  && <Supra />}
      {vehicleId === "tank"   && <Tank />}
    </>
  );
}