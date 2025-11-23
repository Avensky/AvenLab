import { useState, useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import {
    Box3,
    Raycaster,
    Vector3,
    Object3D,
    Matrix3,
    type Intersection,
} from "three";
import type {
    HeightfieldV4In,
    HeightfieldV4Out,
} from "../workers/heightfieldWorker";

type HeightfieldData = {
    nx: number;
    ny: number;
    width: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
    heights: number[];
    lodLevels?: HeightfieldV4Out["lodLevels"];
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
    const groundThreshold = options?.groundThreshold ?? 4;
    const upDotThreshold = options?.upDotThreshold ?? 0.5;

    const maxY = bbox.max.y;
    const down = new Vector3(0, -1, 0);
    const normalMatrix = new Matrix3();

    const offsets = [[0, 0]];

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

            normalMatrix.getNormalMatrix(hit.object.matrixWorld);
            const worldNormal = hit.face.normal
                .clone()
                .applyMatrix3(normalMatrix)
                .normalize();

            if (Math.abs(worldNormal.y) < upDotThreshold) {
                continue;
            }

            const y = point.y;
            const aboveGround = y - bbox.min.y;

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

/**
 * v4 base sampling (same raycasting as v3, but only does the first pass)
 */

async function sampleHeightfieldBase(
    scene: Object3D,
    nx = 128,
    ny = 128,
    onProgress?: (p: number) => void
) {
    const bbox = new Box3().setFromObject(scene);
    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.z - bbox.min.z;

    const minX = bbox.min.x;
    const minZ = bbox.min.z;

    const raycaster = new Raycaster();

    const heights: number[] = new Array(nx * ny).fill(bbox.min.y);

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

        // Let the browser breathe every few rows
        if (iy % 4 === 0) {
            await new Promise((r) => setTimeout(r, 0));
        }
        onProgress?.(iy / (ny - 1));
    }

    return {
        bbox,
        nx,
        ny,
        width,
        depth,
        heights,
    };
}

function downloadJSON(data: HeightfieldData, filename = "city-heightfield-v4.json") {
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
    const [progress, setProgress] = useState(0);

    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        const worker = new Worker(
            new URL("../workers/heightfieldWorker.ts", import.meta.url),
            { type: "module" }
        );
        workerRef.current = worker;

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    const handleGenerate = async () => {
        try {
            setStatus("Sampling v4 (raycast)…");
            setProgress(0);

            // 1) base sampling on main thread
            const base = await sampleHeightfieldBase(scene, nx, ny, (p) =>
                setProgress(p)
            );

            if (!workerRef.current) {
                setStatus("Worker not ready.");
                return;
            }

            setStatus("Processing in worker (v4)…");

            // 2) send heights to worker for v4 post-processing + LOD
            const payload: HeightfieldV4In = {
                nx,
                ny,
                minY: base.bbox.min.y,
                heights: base.heights,
            };

            const result: HeightfieldV4Out = await new Promise((resolve, reject) => {
                const worker = workerRef.current!;
                const handleMessage = (ev: MessageEvent) => {
                    const { cmd, payload } = ev.data;
                    if (cmd === "done") {
                        worker.removeEventListener("message", handleMessage);
                        resolve(payload as HeightfieldV4Out);
                    }
                };
                worker.addEventListener("message", handleMessage);
                worker.postMessage({ cmd: "processHeightfield", payload });

                // Optional: simple timeout
                setTimeout(() => {
                    worker.removeEventListener("message", handleMessage);
                    reject(new Error("Worker timeout"));
                }, 60_000);
            });

            const data: HeightfieldData = {
                nx,
                ny,
                width: base.width,
                depth: base.depth,
                minHeight: result.minHeight,
                maxHeight: result.maxHeight,
                heights: result.heights,
                lodLevels: result.lodLevels, // optional, backend can ignore for now
            };

            downloadJSON(data, "city-heightfield-v4.json");
            setStatus(`Done! Exported v4 ${nx}×${ny} heightfield.`);
            setProgress(1);
        } catch (err) {
            console.error(err);
            setStatus("Error generating v4 heightfield. Check console.");
        }
    };

    return (
        <div
            style={{
                position: "absolute",
                bottom: "1rem",
                left: "1rem",
                padding: "0.75rem 1rem",
                background: "rgba(0,0,0,0.75)",
                color: "white",
                fontSize: "0.8rem",
                borderRadius: "0.5rem",
                zIndex: 30,
            }}
        >
            <div style={{ marginBottom: "0.25rem", fontWeight: 600 }}>
                Heightfield Generator v4
            </div>
            <div style={{ fontSize: "0.7rem", marginBottom: "0.5rem" }}>
                Raycast + worker (LOD “octree”)
            </div>
            <div
                style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                }}
            >
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
            <button onClick={handleGenerate}>Generate Heightfield v4</button>
            {status && <div style={{ marginTop: "0.5rem" }}>{status}</div>}
            {progress > 0 && progress < 1 && (
                <div
                    style={{
                        marginTop: "0.5rem",
                        height: "4px",
                        width: "100%",
                        background: "rgba(255,255,255,0.2)",
                        borderRadius: "999px",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            width: `${Math.round(progress * 100)}%`,
                            height: "100%",
                            background: "#4ade80",
                            transition: "width 0.1s linear",
                        }}
                    />
                </div>
            )}
        </div>
    );
}
