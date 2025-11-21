// // server/src/core/physicsEngine.ts
// import type { Rapier } from "../../rapier.js";
// import { VehicleEntity } from "../entities/VehicleEntity.js";
// import { VEHICLE_CONFIGS } from "../../vehicleRegistry.js";
// import { randomUUID } from "crypto";
// import type {
//     VehicleInputState,
//     VehicleSnapshot,
//     VehicleType,
//     WorldSnapshot,
// } from "../../../../shared/types/physics.js";

// export class PhysicsEngine {
//     private RAPIER: Rapier;
//     public world: Rapier.World;

//     private vehicles = new Map<string, VehicleEntity>();

//     constructor(RAPIER: Rapier) {
//         this.RAPIER = RAPIER;
//         this.world = new this.RAPIER.World({ x: 0, y: -9.81, z: 0 });
//     }

//     async init(): Promise<void> {
//         // Optional: add ground plane
//         const groundDesc = this.RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(
//             0,
//             -0.5,
//             0
//         );
//         this.world.createCollider(groundDesc);
//     }

//     createVehicle(
//         type: VehicleType,
//         spawnPos: { x: number; y: number; z: number }
//     ): VehicleEntity {
//         const config = VEHICLE_CONFIGS[type];
//         if (!config) {
//             throw new Error(`Unknown vehicle type: ${type}`);
//         }

//         const id = randomUUID();
//         const entity = new VehicleEntity(id, this.RAPIER, this.world, config, spawnPos);
//         this.vehicles.set(id, entity);
//         return entity;
//     }

//     removeVehicle(id: string): void {
//         const v = this.vehicles.get(id);
//         if (!v) return;
//         this.world.removeRigidBody(v.body);
//         this.vehicles.delete(id);
//     }

//     updateVehicleInput(id: string, input: Partial<VehicleInputState>): void {
//         const v = this.vehicles.get(id);
//         if (!v) return;
//         v.updateInput(input);
//     }

//     step(_dt: number): void {
//         // Apply controls
//         for (const v of this.vehicles.values()) {
//             v.preStep(_dt);
//         }
//         // Step physics
//         this.world.step();
//     }

//     getSnapshot(): WorldSnapshot {
//         const vehicles: VehicleSnapshot[] = [];
//         for (const v of this.vehicles.values()) {
//             vehicles.push(v.toSnapshot());
//         }
//         return {
//             timestamp: Date.now(),
//             vehicles,
//         };
//     }
// }
