// // server/src/vehicleRegistry.ts
// import type { VehicleType } from "../../shared/types/physics.js";
// import type { VehicleConfig } from "./core/entities/VehicleEntity.js";

// /**
//  * Central vehicle configuration registry.
//  * PhysicsEngine uses this to create vehicles by type.
//  */
// export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
//     camaro: {
//         type: "camaro",
//         mass: 1500,
//         engineForce: 2500,
//         maxSteerAngle: 0.6,
//         size: { x: 2.0, y: 1.4, z: 4.0 },
//     },
//     tank: {
//         type: "tank",
//         mass: 4000,
//         engineForce: 3500,
//         maxSteerAngle: 0.3,
//         size: { x: 3.0, y: 1.8, z: 6.0 },
//     },
//     frs: {
//         type: "frs",
//         mass: 1200,
//         engineForce: 2600,
//         maxSteerAngle: 0.8,
//         size: { x: 1.8, y: 1.2, z: 4.2 },
//     },
//     debug: {
//         type: "debug",
//         mass: 1000,
//         engineForce: 1500,
//         maxSteerAngle: 0.7,
//         size: { x: 1.0, y: 1.0, z: 1.0 },
//     },
// };
