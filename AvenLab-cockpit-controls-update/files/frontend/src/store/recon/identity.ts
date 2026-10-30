import type { CanVehicleIdentity } from "./types";
export const DEFAULT_VEHICLE_IDENTITY: CanVehicleIdentity = {
  slug: "custom-vehicle",
  year: null,
  make: "Custom",
  model: "Vehicle",
  trim: null,
  alias: "Custom",
  datasetKind: "practice",
  notes: "Auto-created vehicle profile for Signal Recon sessions.",
  metadata: { source: "signal-recon-store-default" },
};

export function normalizeVehicleIdentity(
  vehicle: CanVehicleIdentity,
): CanVehicleIdentity {
  const slug =
    vehicle.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "custom-vehicle";

  return {
    ...DEFAULT_VEHICLE_IDENTITY,
    ...vehicle,
    slug,
    make: vehicle.make || "Custom",
    model: vehicle.model || vehicle.alias || slug,
  };
}
