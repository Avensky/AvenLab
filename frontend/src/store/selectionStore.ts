import { create } from "zustand";
import type { ComponentType, PropsWithChildren } from "react";
import type { Group } from "three";
import { Ae86 } from "../vehicles/Ae86";
import { Brz } from "../vehicles/Brz";
import { Camaro } from "../vehicles/Camaro";
import { Gt86 } from "../vehicles/Gt86";
import { Tank } from "../vehicles/Tank";

export type VehicleRole = "tank" | "dps" | "healer" | "utility";
export type VehicleComponent = ComponentType<PropsWithChildren & { ref?: React.Ref<Group>; }>;
export type VehicleDefinition = {
  id: string;
  name: string;
  role: VehicleRole;
  Component: VehicleComponent;
  description: string;
  stats: {
    armor: number;
    speed: number;
    handling: number;
    support: number;
  };
};

export const vehicleCatalog: VehicleDefinition[] = [
  {
    id: "ae86",
    name: "AE86",
    role: "dps",
    Component: Ae86,
    description: "Lightweight attack/recon platform.",
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "brz",
    name: "BRZ",
    role: "dps",
    Component: Brz,
    description: "Lightweight attack/recon platform.",
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "camaro",
    name: "CAMARO",
    role: "dps",
    Component: Camaro,
    description: "Muscle-class attack platform.",
    stats: { armor: 35, speed: 80, handling: 70, support: 10 },
  },
  {
    id: "gt86",
    name: "GT86",
    role: "dps",
    Component: Gt86,
    description: "Balanced lightweight pursuit vehicle.",
    stats: { armor: 25, speed: 85, handling: 90, support: 10 },
  },
  {
    id: "tank",
    name: "TANK",
    role: "tank",
    Component: Tank,
    description: "Heavy frontline armored vehicle.",
    stats: { armor: 100, speed: 25, handling: 20, support: 40 },
  },
];

export type MapDefinition = {
  id: string;
  name: string;
  desc: string;
};

export const mapCatalog: MapDefinition[] = [
  {
    id: "blue_base",
    name: "Blue Team Base",
    desc: "Block_01 city chunk with alley spawn and ocean boundary.",
  },
];

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