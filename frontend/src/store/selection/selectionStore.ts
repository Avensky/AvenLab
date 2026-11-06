import { create } from "zustand";
import type { VehicleDefinition } from "./vehicleCatalog";
import { vehicleCatalog } from "./vehicleCatalog";
import { mapCatalog, useWorldCatalog, type MapDefinition } from "./worldCatalog";
import { NO_INSTALLED_MAP } from "./worldCatalogCore";
export * from "./vehicleCatalog";
export { mapCatalog, type MapDefinition } from "./worldCatalog";

type SelectionState = {
  vehicleIndex: number;
  mapIndex: number;
  mapChosen: boolean;
  catalogRevision: number;

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
  mapChosen: false,
  catalogRevision: 0,

  nextVehicle: () =>
    set((s) => ({
      vehicleIndex: (s.vehicleIndex + 1) % vehicleCatalog.length,
    })),

  prevVehicle: () =>
    set((s) => ({
      vehicleIndex:
        (s.vehicleIndex - 1 + vehicleCatalog.length) % vehicleCatalog.length,
    })),

  nextMap: () => set((s) => {
    const n=useWorldCatalog.getState().maps.length;
    return n?{mapChosen:true,mapIndex:(s.mapIndex+1)%n}:s;
  }),

  prevMap: () => set((s) => {
    const n=useWorldCatalog.getState().maps.length;
    return n?{mapChosen:true,mapIndex:(s.mapIndex-1+n)%n}:s;
  }),

  getSelectedVehicle: () => vehicleCatalog[get().vehicleIndex],
  getSelectedMap: () => useWorldCatalog.getState().maps[get().mapIndex] ??
    NO_INSTALLED_MAP,
}));

// Keep the same world selected when a map is installed or removed, rather
// than treating the previous array index as a different world identity.
useWorldCatalog.subscribe((current,previous)=>{
  if(current.maps===previous.maps)return;
  const previousId=previous.maps[useSelectionStore.getState().mapIndex]?.id;
  const nextIndex=current.maps.findIndex(map=>map.id===previousId);
  useSelectionStore.setState(state=>({mapIndex:Math.max(0,nextIndex),catalogRevision:state.catalogRevision+1}));
});
