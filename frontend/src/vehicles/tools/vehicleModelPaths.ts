export const VEHICLE_MODEL_PATHS = {
  enforcer: "/models/vehicles/enforcer.glb",
  interceptor: "/models/vehicles/interceptor.glb",
  charger70: "/models/vehicles/charger70.glb",
  skyline34: "/models/vehicles/skyline34.glb",
  timecar: "/models/vehicles/timecar.glb",
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
