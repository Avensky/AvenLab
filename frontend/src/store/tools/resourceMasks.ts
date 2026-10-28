// powertrain.rs resource_mask. Separate from input flags and telemetry availability.
export const ResourceFlags = { STARTING: 1, HOT: 2, LOW_FUEL: 4, STARVED: 8, DAMAGED: 16, HEAT_LOCK: 32 } as const;
