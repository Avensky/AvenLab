import { create } from "zustand";
import type { VehicleDefinition } from "./vehicleCatalog";
import { vehicleCatalog } from "./vehicleCatalog";
import { mapCatalog, type MapDefinition } from "./worldCatalog";
export * from "./vehicleCatalog";
export { mapCatalog, type MapDefinition } from "./worldCatalog";

type SelectionState = {
  vehicleIndex: number;
  mapIndex: number;

  nextVehicle: () => void;
  prevVehicle: () => void;
  nextMap: () => void;
  prevMap: () => void;

  getSelectedVehicle: () => VehicleDefinition;
  getSelectedMap: () => MapDefinition;
};

export const useSelectionStore = create<SelectionState>((set, get) => ({
  vehicleIndex: 0,
  mapIndex: 0,

  nextVehicle: () =>
    set((s) => ({
      vehicleIndex: (s.vehicleIndex + 1) % vehicleCatalog.length,
    })),

  prevVehicle: () =>
    set((s) => ({
      vehicleIndex:
        (s.vehicleIndex - 1 + vehicleCatalog.length) % vehicleCatalog.length,
    })),

  nextMap: () =>
    set((s) => ({
      mapIndex: (s.mapIndex + 1) % mapCatalog.length,
    })),

  prevMap: () =>
    set((s) => ({
      mapIndex: (s.mapIndex - 1 + mapCatalog.length) % mapCatalog.length,
    })),

  getSelectedVehicle: () => vehicleCatalog[get().vehicleIndex],
  getSelectedMap: () => mapCatalog[get().mapIndex],
}));
