// // server/src/core/entities/VehicleEntity.ts
// import type { Rapier } from "../../rapier.js";
// import type {
//     VehicleInputState,
//     VehicleSnapshot,
//     VehicleType,
// } from "../../../../shared/types/physics.js";

// export interface VehicleConfig {
//     type: VehicleType;
//     mass: number;
//     engineForce: number;
//     maxSteerAngle: number; // radians
//     size: { x: number; y: number; z: number }; // box half-extents * 2
// }

// export interface Vec3 {
//     x: number;
//     y: number;
//     z: number;
// }

// export class VehicleEntity {
//     public readonly id: string;
//     public readonly type: VehicleType;

//     private RAPIER: Rapier;
//     private world: Rapier.World;
//     public body: Rapier.RigidBody;
//     public collider: Rapier.Collider;

//     public input: VehicleInputState = {
//         throttle: 0,
//         brake: 0,
//         steer: 0,
//         handbrake: false,
//     };

//     private config: VehicleConfig;

//     constructor(
//         id: string,
//         RAPIER: Rapier,
//         world: Rapier.World,
//         config: VehicleConfig,
//         spawnPos: Vec3
//     ) {
//         this.id = id;
//         this.type = config.type;
//         this.RAPIER = RAPIER;
//         this.world = world;
//         this.config = config;

//         // Dynamic body
//         const rbDesc = this.RAPIER.RigidBodyDesc.dynamic().setTranslation(
//             spawnPos.x,
//             spawnPos.y,
//             spawnPos.z
//         );

//         this.body = this.world.createRigidBody(rbDesc);

//         // Simple box collider
//         const colDesc = this.RAPIER.ColliderDesc.cuboid(
//             config.size.x / 2,
//             config.size.y / 2,
//             config.size.z / 2
//         ).setMass(config.mass);

//         this.collider = this.world.createCollider(colDesc, this.body);
//     }

//     updateInput(input: Partial<VehicleInputState>) {
//         this.input = { ...this.input, ...input };
//     }

//     /**
//      * Simple arcade-style movement:
//      * - throttle / brake: move along world -Z (you can later swap to body-forward using rotation)
//      * - steer: yaw torque
//      */
//     preStep(dt: number) {
//         const { throttle, brake, steer, handbrake } = this.input;

//         // Forward direction (for now just world -Z; you can switch to body rotation later)
//         const forward = new this.RAPIER.Vector3(0, 0, -1);

//         const engine = (throttle - brake) * this.config.engineForce * dt;

//         const impulse = new this.RAPIER.Vector3(
//             forward.x * engine,
//             forward.y * engine,
//             forward.z * engine
//         );

//         this.body.applyImpulse(impulse, true);

//         // Steering as yaw torque
//         const yawTorque =
//             steer * this.config.maxSteerAngle * this.config.engineForce * dt * 0.1;

//         const torque = new this.RAPIER.Vector3(0, yawTorque, 0);
//         this.body.applyTorqueImpulse(torque, true);

//         // Handbrake: simple damping
//         if (handbrake) {
//             const v = this.body.linvel();
//             this.body.setLinvel(
//                 new this.RAPIER.Vector3(v.x * 0.9, v.y, v.z * 0.9),
//                 true
//             );
//         }
//     }

//     toSnapshot(): VehicleSnapshot {
//         const t = this.body.translation();
//         const r = this.body.rotation();
//         const v = this.body.linvel();

//         return {
//             id: this.id,
//             vehicleType: this.type,
//             x: t.x,
//             y: t.y,
//             z: t.z,
//             qx: r.x,
//             qy: r.y,
//             qz: r.z,
//             qw: r.w,
//             vx: v.x,
//             vy: v.y,
//             vz: v.z,
//         };
//     }
// }
