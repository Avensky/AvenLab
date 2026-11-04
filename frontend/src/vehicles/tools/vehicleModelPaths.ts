export const VEHICLE_MODEL_PATHS = {
  ae86: "/models/vehicles/ae86.glb",
  sierra: "/models/vehicles/sierra.glb",
  fortuner: "/models/vehicles/fortuner.glb",
  landcruiser: "/models/vehicles/landcruiser.glb",
  mini: "/models/vehicles/mini.glb",
  cx30: "/models/vehicles/cx30.glb",
  brz: "/models/vehicles/brz.glb",
  camaro: "/models/vehicles/camaro.glb",
  supra: "/models/vehicles/supra_2020.glb",
  tank: "/models/vehicles/tank.glb",
} as const;
export type VehicleModelId = keyof typeof VEHICLE_MODEL_PATHS;
