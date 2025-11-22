// src/physicsCity.ts
import fs from "fs/promises";
import type { Rapier } from "./types.js";

type HeightfieldData = {
    nx: number;
    ny: number;
    width: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
    heights: number[];
};

export async function addCityHeightfieldCollider(RAPIER: Rapier, world: any) {
    const raw = await fs.readFile("data/city-heightfield.json", "utf8");
    const data: HeightfieldData = JSON.parse(raw);

    const heights = Float32Array.from(data.heights);

    // Rapier heightfield expects (nrows, ncols, heights, scale)
    // Here we map ny => rows (z), nx => cols (x)
    const colliderDesc = RAPIER.ColliderDesc.heightfield(
        data.ny,
        data.nx,
        heights,
        { x: data.width, y: data.depth }
    );

    world.createCollider(colliderDesc);
}
