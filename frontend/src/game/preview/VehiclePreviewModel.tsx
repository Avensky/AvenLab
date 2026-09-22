import { useSelectionStore } from "../../store";
import { Ae86, Brz, Camaro, Supra, Tank } from "../../vehicles";

export function VehiclePreviewModel() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id);
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