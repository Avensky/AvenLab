// server/src/physics.ts

import type { Rapier } from "./types.js"; // we’ll define this later
import { loadRapier } from "./rapier.js";

import { randomUUID } from "crypto";
import { PlayerInput } from "./types.js";

interface BodyEntry {
    id: string;
    body: any;
}

export class PhysicsWorld {
    public world: any;
    private bodies: any[] = [];
    private RAPIER: any;

    constructor(RAPIER: Rapier) {
        this.RAPIER = RAPIER;

        this.world = new this.RAPIER.World({
            x: 0,
            y: -9.81,
            z: 0
        });

        const ground = this.RAPIER.ColliderDesc
            .cuboid(50, 0.5, 50)
            .setTranslation(0, -0.5, 0);

        this.world.createCollider(ground);
    }





    createPlayerBody(position = { x: 0, y: 2, z: 0 }) {
        const id = randomUUID();

        const rbDesc = this.RAPIER.RigidBodyDesc
            .dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setLinearDamping(0.4)
            .setAngularDamping(0.8);

        const body = this.world.createRigidBody(rbDesc);
        const col = this.RAPIER.ColliderDesc.cuboid(0.5, 0.5, 1.0); // like a car-ish box
        this.world.createCollider(col, body);

        this.bodies.push({ id, body });
        return id;
    }

    destroyBody(id: string) {
        const idx = this.bodies.findIndex((b) => b.id === id);
        if (idx === -1) return;

        const entry = this.bodies[idx];
        this.world.removeRigidBody(entry.body);
        this.bodies.splice(idx, 1);
    }

    // 🔥 NEW: apply input to a specific body
    applyInput(bodyId: string, input: PlayerInput, dt: number) {
        const entry = this.bodies.find((b) => b.id === bodyId);
        if (!entry) return;

        const body = entry.body;

        // Simple “car-ish” control in XZ plane
        const forwardForce = 50;   // tweak these
        const steerSpeed = 2.0;

        // Forward/backward along -Z in world space
        const throttle = input.throttle; // -1..1
        if (throttle !== 0) {
            const impulse = {
                x: 0,
                y: 0,
                z: -throttle * forwardForce * dt
            };
            body.applyImpulse(impulse, true);
        }

        // Steering as yaw angular velocity
        const steer = input.steer; // -1..1
        if (steer !== 0) {
            body.applyTorqueImpulse({ x: 0, y: steer * steerSpeed * dt, z: 0 }, true);
        }
    }





    createTestBox(pos = { x: 0, y: 5, z: 0 }) {
        const id = randomUUID();

        const rb = this.RAPIER.RigidBodyDesc
            .dynamic()
            .setTranslation(pos.x, pos.y, pos.z);
        const body = this.world.createRigidBody(rb);

        const col = this.RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
        this.world.createCollider(col, body);

        this.bodies.push({ id, body });
        return id;
    }

    step(dt: number) {
        this.world.timestep = dt;
        this.world.step();
    }


    // in PhysicsWorld.getSnapshot:
    getSnapshot(tick: number) {
        const bodies = this.bodies.map(({ id, body }) => {
            const t = body.translation();
            const r = body.rotation();
            return {
                id,
                x: t.x,
                y: t.y,
                z: t.z,
                qx: r.x,
                qy: r.y,
                qz: r.z,
                qw: r.w
            };
        });

        return {
            tick,
            timestamp: Date.now(),
            bodies
        };
    }
}

export let physicsWorld: PhysicsWorld;

export async function initPhysics() {
    const RAPIER = await loadRapier();
    physicsWorld = new PhysicsWorld(RAPIER);
}