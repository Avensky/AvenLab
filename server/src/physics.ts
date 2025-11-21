// server/src/physics.ts

import type { Rapier } from "./types.js"; // we’ll define this later
import { randomUUID } from "crypto";

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

    getSnapshot() {
        return {
            timestamp: Date.now(),
            bodies: this.bodies.map(({ id, body }) => {
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
            })
        };
    }
}
