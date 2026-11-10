import { Vector3, type Object3D } from "three";
import { TIMECAR_DRIVER_DOOR } from "./timecarDriverDoorParts";
import { splitVehicleAssembly } from "./splitGarageSteering";
import type { VehiclePartHinge } from "./vehiclePartRig";

export function splitTimecarDriverDoor(root: Object3D) {
  const assembly = splitVehicleAssembly(root, TIMECAR_DRIVER_DOOR, "garage-gullwing-driver", new Vector3(.145, .486, .01));
  if (!assembly) return;
  const hinge: VehiclePartHinge = {
    part: "door-left", pivot: assembly.root, axis: "z", closed: 0, open: Math.PI * .39, angle: 0,
  };
  return { hinge, dispose: assembly.dispose };
}
