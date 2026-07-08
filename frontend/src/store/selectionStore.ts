import { create } from "zustand";
import type { ComponentType, PropsWithChildren } from "react";
import type { Group } from "three";
import { Ae86 } from "../vehicles/Ae86";
import { Brz } from "../vehicles/Brz";
import { Camaro } from "../vehicles/Camaro";
import { Gt86 } from "../vehicles/Gt86";
import { Tank } from "../vehicles/Tank";
import type { CanVehicleIdentity } from "./signalReconStore";
export type VehicleRole = "tank" | "dps" | "healer" | "utility";
export type VehicleComponent = ComponentType<PropsWithChildren & { ref?: React.Ref<Group>; }>;

export type CanDatasetKind = "live" | "practice" | "simulation";

export type VehicleDefinition = {
  id: string;
  name: string;
  role: VehicleRole;
  Component: VehicleComponent;
  description: string;
  canIdentity: CanVehicleIdentity;
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
    canIdentity: {
      slug: "ae86-custom-ecu",
      year: 1986,
      make: "Toyota",
      model: "Corolla AE86",
      trim: "Custom ECU",
      alias: "AE86",
      datasetKind: "practice",
      notes: "Practice target for custom ECU and simulated replay training.",
      metadata: { platform: "custom", source: "vehicle-selector" },
    },
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "brz",
    name: "BRZ",
    role: "dps",
    Component: Brz,
    description: "Lightweight attack/recon platform.",
    canIdentity: {
      slug: "subaru-brz-practice",
      year: null,
      make: "Subaru",
      model: "BRZ",
      trim: "Practice",
      alias: "BRZ",
      datasetKind: "practice",
      notes: "Practice profile for BRZ-style CAN experiments and replay sessions.",
      metadata: { platform: "ZN6/ZC6", source: "vehicle-selector" },
    },
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "camaro",
    name: "CAMARO",
    role: "dps",
    Component: Camaro,
    description: "Muscle-class attack platform.",
    canIdentity: {
      slug: "2017-chevrolet-camaro",
      year: 2017,
      make: "Chevrolet",
      model: "Camaro",
      trim: null,
      alias: "Camaro",
      datasetKind: "practice",
      notes: "Separate profile for Camaro captures, playback, and vehicle-specific decoding.",
      metadata: { source: "vehicle-selector" },
    },
    stats: { armor: 35, speed: 80, handling: 70, support: 10 },
  },
  {
    id: "gt86",
    name: "GT86",
    role: "dps",
    Component: Gt86,
    description: "Balanced lightweight pursuit vehicle.",
    canIdentity: {
      slug: "2015-scion-frs",
      year: 2015,
      make: "Scion",
      model: "FR-S",
      trim: "Manual",
      alias: "GT86",
      datasetKind: "live",
      notes: "Primary real CAN target. The GT86 visual model represents the 2015 Scion FR-S dataset.",
      metadata: { platform: "ZN6", source: "vehicle-selector" },
    },
    stats: { armor: 25, speed: 85, handling: 90, support: 10 },
  },
  {
    id: "tank",
    name: "TANK",
    role: "tank",
    Component: Tank,
    description: "Heavy frontline armored vehicle.",
    canIdentity: {
      slug: "tank-custom-ecu",
      year: null,
      make: "Custom",
      model: "Tank ECU",
      trim: "Simulation",
      alias: "Tank",
      datasetKind: "simulation",
      notes: "Simulation-only profile for non-automotive custom CAN practice.",
      metadata: { platform: "simulation", source: "vehicle-selector" },
    },
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