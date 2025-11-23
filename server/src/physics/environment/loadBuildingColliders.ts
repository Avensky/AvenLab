import fs from "fs/promises";
import path from "path";
import type { Rapier } from "../../types.js";

export async function loadBuildingColliders(RAPIER: Rapier, world: any) {
    const file = path.join(process.cwd(), "data/city-building-colliders.json");
    const colliders = JSON.parse(await fs.readFile(file, "utf8"));

    for (const b of colliders) {
        const [cx, cy, cz] = b.center;
        const [sx, sy, sz] = b.size;
        const [rx, ry, rz] = b.rotation;

        const collider = RAPIER.ColliderDesc.cuboid(
            sx / 2,
            sy / 2,
            sz / 2
        )
            .setTranslation(cx, cy, cz)
            .setRotation(RAPIER.Quaternion.fromEulerAngles(rx, ry, rz));

        world.createCollider(collider);
    }

    console.log(`[ENV] Loaded ${colliders.length} building colliders ✔`);
}
