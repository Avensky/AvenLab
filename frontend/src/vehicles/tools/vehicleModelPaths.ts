import {vehicleModelUrl} from '../assetCatalog.ts';
export const VEHICLE_MODEL_PATHS = {
  "hawaii-rescue": vehicleModelUrl('hawaii-rescue'),
  "louisiana": vehicleModelUrl('louisiana'),
  enforcer: vehicleModelUrl('enforcer'),
  interceptor: vehicleModelUrl('interceptor'),
  charger70: vehicleModelUrl('charger70'),
  skyline34: vehicleModelUrl('skyline34'),
  timecar: vehicleModelUrl('timecar'),
  ae86: vehicleModelUrl('ae86'),
  sierra: vehicleModelUrl('sierra'),
  fortuner: vehicleModelUrl('fortuner'),
  landcruiser: vehicleModelUrl('landcruiser'),
  mini: vehicleModelUrl('mini'),
  cx30: vehicleModelUrl('cx30'),
  brz: vehicleModelUrl('brz'),
  camaro: vehicleModelUrl('camaro'),
  supra: vehicleModelUrl('supra'),
  tank: vehicleModelUrl('tank'),
} as const;
export type VehicleModelId = keyof typeof VEHICLE_MODEL_PATHS;
