import type { CanVehicleIdentity } from "../recon/types";

// Data only: model components are registered under src/vehicles.
export type VehicleRole = "tank" | "dps" | "healer" | "utility";

export type CanDatasetKind = "live" | "practice" | "simulation";

export type VehicleDefinition = {
  id: string;
  name: string;
  role: VehicleRole;
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
    description: "Lightweight attack/recon platform.",
    canIdentity: {
      slug: "subaru-brz-practice",
      year: null,
      make: "Subaru",
      model: "BRZ",
      trim: "Practice",
      alias: "BRZ",
      datasetKind: "practice",
      notes:
        "Practice profile for BRZ-style CAN experiments and replay sessions.",
      metadata: { platform: "ZN6/ZC6", source: "vehicle-selector" },
    },
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "camaro",
    name: "CAMARO",
    role: "dps",
    description: "Muscle-class attack platform.",
    canIdentity: {
      slug: "2017-chevrolet-camaro",
      year: 2017,
      make: "Chevrolet",
      model: "Camaro",
      trim: null,
      alias: "Camaro",
      datasetKind: "practice",
      notes:
        "Separate profile for Camaro captures, playback, and vehicle-specific decoding.",
      metadata: { source: "vehicle-selector" },
    },
    stats: { armor: 35, speed: 80, handling: 70, support: 10 },
  },
  {
    id: "supra",
    name: "Supra",
    role: "dps",
    description: "Balanced lightweight pursuit vehicle.",
    canIdentity: {
      slug: "1998-toyota-supra",
      year: 1998,
      make: "Toyota",
      model: "FR-S",
      trim: "Manual",
      alias: "Supra",
      datasetKind: "live",
      notes: "Live dataset for the 1998 Toyota Supra.",
      metadata: { source: "vehicle-selector" },
    },
    stats: { armor: 25, speed: 85, handling: 90, support: 10 },
  },
  {
    id: "tank",
    name: "TANK",
    role: "tank",
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
