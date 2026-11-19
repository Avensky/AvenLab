import { Matrix4 } from "three";
import { GARAGE_STATIONS } from "../../game/preview/garageStations.ts";
import type { VehicleModelId } from "../tools/vehicleModelPaths";
import { DRIVER_CROWN, DRIVER_HAT_CROWN } from "./driverGeometry.ts";

const aliases: Record<string, VehicleModelId> = {
  "toyota-ae86": "ae86", "subaru-brz": "brz", frs: "brz", "fr-s": "brz", "scion-frs": "brz", "scion-fr-s": "brz", gt86: "brz", "toyota-gt86": "brz",
  "camaro-2017": "camaro", "supra-2020": "supra", "gr-supra": "supra", "toyota-supra": "supra", a90: "supra", "toyota-a90": "supra",
};

export function driverCabin(vehicle: string | null | undefined) {
  const name = vehicle?.trim().toLowerCase().replaceAll("_", "-") ?? "";
  const model = aliases[name] ?? name;
  if (!Object.hasOwn(GARAGE_STATIONS, model)) return null;
  const station = GARAGE_STATIONS[model as VehicleModelId];
  // Ship bridges have different source units and no car seat. This LOD belongs
  // to occupied road/tracked vehicles, never parked props or marine scenery.
  if (station.kind === "bridge") return null;
  const { seat, roof } = station;
  const units = station.kind === "levers" ? station.units : 1;
  function fit(crown: number) {
    const y = Math.min(seat[1], roof - (crown + .025) * units);
    return new Matrix4().makeScale(units, units, units).setPosition(seat[0], y, seat[2]);
  }
  return { model: model as VehicleModelId, units, bare: fit(DRIVER_CROWN), hat: fit(DRIVER_HAT_CROWN) };
}
