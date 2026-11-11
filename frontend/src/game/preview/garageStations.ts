import { Vector3 } from "three";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

type Point = readonly [number, number, number];

type WheelStation = {
  kind: "wheel";
  seat: Point;
  roof: number;
  pedals: Point;
  rim: Point;
  radius: number;
  tilt: number;
  steeringParts?: readonly string[];
  selector?: "column";
  parkingBrake?: "switch" | "pedal";
};

type LeverStation = {
  kind: "levers";
  seat: Point;
  roof: number;
  pedals: Point;
  grips: readonly [Point, Point];
  units: number;
};

type BridgeStation = {
  kind: "bridge";
  deck: Point;
  units: number;
  heading: 1 | -1;
};

export type GarageStation = WheelStation | LeverStation | BridgeStation;

// Measurements are in the complete showroom GLB's local coordinates.
// Baked interior wheels use the validated split in splitGarageSteering.
export const GARAGE_STATIONS: Record<VehicleModelId, GarageStation> = {
  ae86: { kind: "wheel", seat: [-.397, .42, -.07], roof: 1.21, pedals: [-.397, .24, .565],
    rim: [-.397, .745, .365], radius: .158, tilt: .38, steeringParts: ["SteeringWheel"] },
  brz: { kind: "wheel", seat: [.36, .40, -.17], roof: 1.19, pedals: [.36, .20, .49],
    rim: [.36, .686, .252], radius: .139, tilt: .34, steeringParts: ["Mesh128__19_0", "Mesh128__Color_B05_3_0", "Mesh128_black1_0"] },
  camaro: { kind: "wheel", seat: [.356, .59, -.23], roof: 1.33, pedals: [.41, .47, .67],
    rim: [.356, .919, .209], radius: .178, tilt: .27,
    steeringParts: ["STEERING_WHEEL_SIDES", "STEERING_WHEEL_CENTER", "STEERING_WHEEL_BOTTOM", "STEERING_WHEEL_INSIDE"] },
  supra: { kind: "wheel", seat: [.375, .46, -.43], roof: 1.20, pedals: [.375, .26, .25],
    rim: [.375, .788, -.018], radius: .174, tilt: .38, steeringParts: ["garage-steering-wheel"] },
  mini: { kind: "wheel", seat: [.333, -.19, -.31], roof: .75, pedals: [.333, -.43, .48],
    rim: [.333, .109, .127], radius: .175, tilt: .40, steeringParts: ["garage-steering-wheel"] },
  fortuner: { kind: "wheel", seat: [-.373, -.12, -.01], roof: .73, pedals: [-.373, -.39, .79],
    rim: [-.373, .197, .435], radius: .176, tilt: .42, steeringParts: ["garage-steering-wheel"] },
  landcruiser: { kind: "wheel", seat: [.396, -.04, -.04], roof: .87, pedals: [.396, -.35, .74],
    rim: [.396, .273, .391], radius: .173, tilt: .41, steeringParts: ["garage-steering-wheel"] },
  cx30: { kind: "wheel", seat: [.382, -.24, -.13], roof: .63, pedals: [.382, -.24, .67],
    rim: [.382, .118, .335], radius: .183, tilt: .40, steeringParts: ["garage-steering-wheel"] },
  sierra: { kind: "wheel", seat: [.421, -.14, .58], roof: .95, pedals: [.414, -.42, 1.36],
    selector: "column", parkingBrake: "switch",
    rim: [.379, .187, 1.045], radius: .176, tilt: .46, steeringParts: ["garage-steering-wheel"] },
  enforcer: { kind: "wheel", seat: [.341, -.20, -.08], roof: .58, pedals: [.341, -.38, .68],
    selector: "column", parkingBrake: "pedal",
    rim: [.341, .131, .35], radius: .166, tilt: .39, steeringParts: ["garage-steering-wheel"] },
  interceptor: { kind: "wheel", seat: [.37, -.20, .12], roof: .56, pedals: [.37, -.37, .88],
    selector: "column", parkingBrake: "pedal",
    rim: [.37, .073, .573], radius: .174, tilt: .32, steeringParts: ["garage-steering-wheel"] },
  charger70: { kind: "wheel", seat: [.383, -.15, .06], roof: .65, pedals: [.383, -.34, .81],
    rim: [.383, .165, .506], radius: .188, tilt: .33, steeringParts: ["garage-steering-wheel"] },
  skyline34: { kind: "wheel", seat: [-.355, -.15, -.10], roof: .60, pedals: [-.355, -.34, .65],
    rim: [-.355, .148, .338], radius: .167, tilt: .37, steeringParts: ["garage-steering-wheel"] },
  timecar: { kind: "wheel", seat: [.411, -.27, -.12], roof: .485, pedals: [.411, -.41, .58],
    rim: [.411, .038, .295], radius: .143, tilt: .40, steeringParts: ["garage-steering-wheel"] },
  tank: { kind: "levers", seat: [.46, .77, 1.25], roof: 1.37, pedals: [.43, .59, 1.88], units: .77,
    grips: [[.63, .98, 1.59], [.29, .98, 1.59]] },
  "hawaii-rescue": { kind: "bridge", deck: [.061, .772, .063], units: .032, heading: -1 },
  louisiana: { kind: "bridge", deck: [-12.4, 18.6, -7.85], units: .86, heading: 1 },
};

export function garageStationCamera(station: GarageStation) {
  if (station.kind === "bridge") {
    const { deck, units, heading } = station;
    return { at: [deck[0], deck[1] + 1.49 * units, deck[2]], eye: [.44 * units, -.01 * units, .81 * units * heading] } as const;
  }
  if (station.kind === "levers") {
    const [x, y, z] = station.seat;
    return { at: [x, y + .40, z + .07], eye: [.26, -.09, .48] } as const;
  }
  const [x, y, z] = station.rim;
  return { at: [x, y + .015, z + .03], eye: [0, .30, station.seat[2] + .15 - z] } as const;
}

export function garageControlTargets(station: Extract<GarageStation, { kind: "wheel" }>) {
  const [x, y, z] = station.rim;
  const [seatX, seatY, seatZ] = station.seat;
  const side = Math.sign(seatX);
  return {
    shift: new Vector3(station.selector === "column" ? x - .19 : seatX - side * .33,
      station.selector === "column" ? y - .015 : seatY + .10,
      station.selector === "column" ? z + .06 : seatZ + .29),
    handbrake: new Vector3(station.parkingBrake === "switch" ? x + .23 : seatX - side * .30,
      station.parkingBrake === "switch" ? y - .07 : seatY + .055,
      station.parkingBrake === "switch" ? z + .07 : seatZ + .13),
    ignition: new Vector3(x - .14, y - .11, z + .09),
    signal: new Vector3(x + .20, y - .03, z + .08),
    wipers: new Vector3(x - .20, y - .025, z + .075),
    cruise: new Vector3(x - .17, y - .105, z + .065),
  };
}
