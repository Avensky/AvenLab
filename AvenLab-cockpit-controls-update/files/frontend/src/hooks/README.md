# Shared simulation/render adapters

usePhysicsInterpolator.ts buffers authoritative poses. useVehicleVisualAlignment.ts derives a setup-aligned visual report.

## How to edit

Read snapshots without setting React state every frame. New vehicle identities clear old interpolation poses. Calibration changes belong to vehicleConfigStore; UI preferences must not alter physical collision setup.
