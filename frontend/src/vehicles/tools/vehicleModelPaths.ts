export const VEHICLE_MODEL_PATHS = {
  ae86: "/models/vehicles/ae86.glb",
  brz: "/models/vehicles/brz.glb",
  camaro: "/models/vehicles/camaro.glb",
  supra: "/models/vehicles/supra_2020.glb",
  tank: "/models/vehicles/tank2.glb",
} as const;
export type VehicleModelId = keyof typeof VEHICLE_MODEL_PATHS;
