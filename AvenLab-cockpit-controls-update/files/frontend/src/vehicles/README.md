# Driveable vehicle visuals

VehicleRoster.tsx owns stable entity membership; VehicleScene.tsx composes active renderers. Ae86/Brz/Camaro/Supra/Tank are visual implementations. tools/ owns alignment, materials, lights and rig extraction.

## How to edit

Add a vehicle ID to selection metadata, Rust vehicle_setup.rs and renderer roster. Keep local geometry transforms out of network state. Shared cached GLBs must not be mutated; preserve negative-scale nodes and source materials. Physics dimensions are Rust-owned.
