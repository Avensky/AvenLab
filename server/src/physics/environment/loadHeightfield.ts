import fs from "fs/promises";
import path from "path";
import type { Rapier } from "../../types.js";

type HeightfieldV4 = {
    nx: number;
    ny: number;
    width: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
    heights: number[];
    lodLevels?: {
        level: number;
        nx: number;
        ny: number;
        heights: number[];
    }[];
};

const MAX_ABS_HEIGHT = 10_000; // safety clamp

export async function loadHeightfield(RAPIER: Rapier, world: any) {
    const file = path.join(process.cwd(), "data", "city-heightfield-v4.json");

    let json: HeightfieldV4;
    try {
        const raw = await fs.readFile(file, "utf8");
        json = JSON.parse(raw) as HeightfieldV4;
    } catch (err) {
        console.error("[Heightfield] Failed to read/parse city-heightfield-v4.json:", err);
        createFallbackGround(RAPIER, world);
        return;
    }

    const { nx, ny, width, depth, heights } = json;

    // --------- Basic validation ----------
    if (
        typeof nx !== "number" ||
        typeof ny !== "number" ||
        nx <= 1 ||
        ny <= 1 ||
        !Array.isArray(heights)
    ) {
        console.error(
            "[Heightfield] Invalid dimensions or heights array in JSON:",
            { nx, ny, hasHeightsArray: Array.isArray(heights) }
        );
        createFallbackGround(RAPIER, world);
        return;
    }

    if (heights.length !== nx * ny) {
        console.error(
            "[Heightfield] heights.length mismatch:",
            "nx * ny =", nx * ny,
            "heights.length =", heights.length
        );
        createFallbackGround(RAPIER, world);
        return;
    }

    if (typeof width !== "number" || typeof depth !== "number" || width <= 0 || depth <= 0) {
        console.error(
            "[Heightfield] Invalid width/depth in JSON:",
            { width, depth }
        );
        createFallbackGround(RAPIER, world);
        return;
    }

    // --------- Sanitize heights ----------
    const sanitized = new Float32Array(nx * ny);
    let minH = Number.POSITIVE_INFINITY;
    let maxH = Number.NEGATIVE_INFINITY;
    let corrections = 0;

    for (let i = 0; i < heights.length; i++) {
        let h = heights[i];

        if (typeof h !== "number" || !Number.isFinite(h)) {
            h = 0;
            corrections++;
        } else if (Math.abs(h) > MAX_ABS_HEIGHT) {
            h = Math.max(-MAX_ABS_HEIGHT, Math.min(MAX_ABS_HEIGHT, h));
            corrections++;
        }

        sanitized[i] = h;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
    }

    if (corrections > 0) {
        console.warn(
            `[Heightfield] Sanitized ${corrections} height values (NaN/Infinity/out-of-range).`
        );
    }

    console.log(
        `[Heightfield] v4 data ok. nx=${nx}, ny=${ny}, ` +
        `minH=${minH.toFixed(3)}, maxH=${maxH.toFixed(3)}, ` +
        `width=${width.toFixed(3)}, depth=${depth.toFixed(3)}`
    );

    // --------- Create Rapier heightfield with full safety ----------
    try {
        // Rapier API: heightfield(rows, cols, heights, scale)
        // rows = ny, cols = nx
        const rows = ny;
        const cols = nx;

        const colliderDesc = RAPIER.ColliderDesc.heightfield(
            rows,
            cols,
            sanitized,
            {
                x: width,
                y: depth,
            }
        ).setTranslation(0, 0, 0);

        world.createCollider(colliderDesc);

        console.log("[Heightfield] Heightfield v4 collider created ✔");
    } catch (err) {
        console.error("[Heightfield] Rapier heightfield creation failed, using fallback ground:", err);
        createFallbackGround(RAPIER, world);
    }
}

/**
 * Fallback: simple flat ground plane if anything goes wrong.
 */
function createFallbackGround(RAPIER: Rapier, world: any) {
    const size = 200;
    const half = size / 2;

    try {
        const groundDesc = RAPIER.ColliderDesc.cuboid(half, 0.5, half).setTranslation(0, -0.5, 0);
        world.createCollider(groundDesc);
        console.log("[Heightfield] Fallback flat ground collider created ✔");
    } catch (err) {
        console.error("[Heightfield] Failed to create fallback ground collider:", err);
    }
}
