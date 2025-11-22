import { useState } from "react";
import { useGLTF } from "@react-three/drei";
import {
    Box3,
    Raycaster,
    Vector3,
    Object3D,
    Matrix3,
    type Intersection,
} from "three";

type HeightfieldData = {
    nx: number;
    ny: number;
    width: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
    heights: number[];
};

function sampleHeightAt(
    scene: Object3D,
    raycaster: Raycaster,
    bbox: Box3,
    x: number,
    z: number,
    options?: {
        groundThreshold?: number;
        upDotThreshold?: number;
    }
): number {
    const groundThreshold = options?.groundThreshold ?? 4; // max height above "terrain" for valid samples
    const upDotThreshold = options?.upDotThreshold ?? 0.5; // reject surfaces where |normal.y| < this (walls)

    const maxY = bbox.max.y;
    const down = new Vector3(0, -1, 0);
    const normalMatrix = new Matrix3();

    const offsets = [
        [0, 0],
        [0.3, 0],
        [-0.3, 0],
        [0, 0.3],
        [0, -0.3],
    ];

    let bestY: number | null = null;

    for (const [ox, oz] of offsets) {
        const origin = new Vector3(x + ox, maxY + 50, z + oz);
        raycaster.set(origin, down);

        const hits = raycaster.intersectObject(scene, true);
        if (!hits.length) continue;

        for (let h = 0; h < hits.length; h++) {
            const hit: Intersection = hits[h];
            const point = hit.point;

            if (!hit.face || !hit.object) continue;

            // Compute world-space normal
            normalMatrix.getNormalMatrix(hit.object.matrixWorld);
            const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();

            // Ignore steep/vertical surfaces (walls, building sides)
            if (Math.abs(worldNormal.y) < upDotThreshold) {
                continue;
            }

            const y = point.y;
            const aboveGround = y - bbox.min.y;

            // Reject roofs/ledges that are much higher than "terrain"
            if (aboveGround > groundThreshold) {
                continue;
            }

            if (bestY === null || y < bestY) {
                bestY = y;
            }
        }
    }

    return bestY ?? bbox.min.y;
}

async function generateHeightfieldV3(
    scene: Object3D,
    nx = 128,
    ny = 128
): Promise<HeightfieldData> {
    const bbox = new Box3().setFromObject(scene);
    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.z - bbox.min.z;

    const minX = bbox.min.x;
    const minZ = bbox.min.z;

    const raycaster = new Raycaster();

    const heights: number[] = new Array(nx * ny).fill(bbox.min.y);

    // --------- Initial sampling with building avoidance + normal filtering ----------
    for (let iy = 0; iy < ny; iy++) {
        const z = minZ + (iy / (ny - 1)) * depth;

        for (let ix = 0; ix < nx; ix++) {
            const x = minX + (ix / (nx - 1)) * width;
            const height = sampleHeightAt(scene, raycaster, bbox, x, z, {
                groundThreshold: 4,
                upDotThreshold: 0.5,
            });

            heights[iy * nx + ix] = height;
        }
    }

    // --------- Hole filling pass ----------
    const fillPasses = 2;
    for (let pass = 0; pass < fillPasses; pass++) {
        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                const i = iy * nx + ix;
                if (heights[i] !== bbox.min.y) continue;

                const neighbors: number[] = [];
                if (ix > 0) neighbors.push(heights[i - 1]);
                if (ix < nx - 1) neighbors.push(heights[i + 1]);
                if (iy > 0) neighbors.push(heights[i - nx]);
                if (iy < ny - 1) neighbors.push(heights[i + nx]);

                const valid = neighbors.filter((v) => v !== bbox.min.y);
                if (valid.length > 0) {
                    heights[i] = valid.reduce((a, b) => a + b, 0) / valid.length;
                }
            }
        }
    }

    // --------- Edge detection + clamping ----------
    // If a cell is much higher than its neighbors, treat as a building edge and clamp.
    const edgeHeightThreshold = 2.5;

    for (let iy = 1; iy < ny - 1; iy++) {
        for (let ix = 1; ix < nx - 1; ix++) {
            const i = iy * nx + ix;
            const h = heights[i];

            const left = heights[i - 1];
            const right = heights[i + 1];
            const up = heights[i - nx];
            const down = heights[i + nx];

            const minNeighbor = Math.min(left, right, up, down);
            const maxNeighbor = Math.max(left, right, up, down);

            const isSpikeUp = h - minNeighbor > edgeHeightThreshold;
            const isSpikeDown = maxNeighbor - h > edgeHeightThreshold;

            // Clamp big spikes to local average of neighbors
            if (isSpikeUp || isSpikeDown) {
                const avg =
                    (left + right + up + down) / 4;
                heights[i] = avg;
            }
        }
    }

    // --------- Optional smoothing ----------
    const smoothingPasses = 1; // increase for softer terrain
    for (let pass = 0; pass < smoothingPasses; pass++) {
        const copy = heights.slice();

        for (let iy = 1; iy < ny - 1; iy++) {
            for (let ix = 1; ix < nx - 1; ix++) {
                const i = iy * nx + ix;
                const h = copy[i];

                const left = copy[i - 1];
                const right = copy[i + 1];
                const up = copy[i - nx];
                const down = copy[i + nx];

                heights[i] = (h + left + right + up + down) / 5;
            }
        }
    }

    return {
        nx,
        ny,
        width,
        depth,
        minHeight: Math.min(...heights),
        maxHeight: Math.max(...heights),
        heights,
    };
}

function downloadJSON(data: HeightfieldData, filename = "city-heightfield-v3.json") {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function HeightfieldGeneratorPanel() {
    const { scene } = useGLTF("/models/city.glb");
    const [status, setStatus] = useState<null | string>(null);
    const [nx, setNx] = useState(128);
    const [ny, setNy] = useState(128);

    const handleGenerate = async () => {
        try {
            setStatus("Generating heightfield v3…");
            const data = await generateHeightfieldV3(scene, nx, ny);
            downloadJSON(data);
            setStatus(`Done! Exported ${nx}×${ny} heightfield.`);
        } catch (err) {
            console.error(err);
            setStatus("Error generating heightfield. Check console.");
        }
    };

    return (
        <div
            style={{
                position: "absolute",
                bottom: "1rem",
                left: "1rem",
                padding: "0.75rem 1rem",
                background: "rgba(0,0,0,0.7)",
                color: "white",
                fontSize: "0.8rem",
                borderRadius: "0.5rem",
                zIndex: 30,
            }}
        >
            <div style={{ marginBottom: "0.5rem" }}>Heightfield Generator v3</div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <label>
                    nx:
                    <input
                        type="number"
                        min={16}
                        max={512}
                        value={nx}
                        onChange={(e) => setNx(Number(e.target.value))}
                        style={{ width: "4rem", marginLeft: "0.25rem" }}
                    />
                </label>
                <label>
                    ny:
                    <input
                        type="number"
                        min={16}
                        max={512}
                        value={ny}
                        onChange={(e) => setNy(Number(e.target.value))}
                        style={{ width: "4rem", marginLeft: "0.25rem" }}
                    />
                </label>
            </div>
            <button onClick={handleGenerate}>Generate Heightfield v3</button>
            {status && <div style={{ marginTop: "0.5rem" }}>{status}</div>}
        </div>
    );
}
