import { useMemo } from "react";
import { Box3, Mesh, Object3D, Vector3 } from "three";

interface Props {
    glb: Object3D;
}

export function CityBuildingColliders({ glb }: Props) {
    const buildings = useMemo(() => {
        const meshBoxes: { box: Box3; obj: Object3D }[] = [];

        // 1. Collect bounding boxes, filtering out irrelevant meshes
        glb.traverse((child: any) => {
            if (!(child instanceof Mesh)) return;

            const box = new Box3().setFromObject(child);
            if (box.isEmpty()) return;

            const size = new Vector3();
            box.getSize(size);

            // ignore ground-level, very flat meshes
            if (size.y < 8) return;

            // ignore massive ground plane meshes (big XZ, low Y)
            if ((size.x > 100 || size.z > 100) && size.y < 20) return;

            // ignore tiny clutter
            if (size.x < 1 && size.z < 1) return;

            meshBoxes.push({ box, obj: child });
        });

        // 2. Create voxel grid for clustering
        const CELL = 30; // size of voxel cell
        const cellMap = new Map<string, Box3[]>();

        function getCellKey(x: number, z: number) {
            return `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`;
        }

        for (const { box } of meshBoxes) {
            const c = new Vector3();
            box.getCenter(c);
            const key = getCellKey(c.x, c.z);

            if (!cellMap.has(key)) cellMap.set(key, []);
            cellMap.get(key)!.push(box);
        }

        // 3. Flood-fill connected cells into building clusters
        const visited = new Set<string>();
        const clusters: Box3[][] = [];

        const dirs = [
            [1, 0], [-1, 0],
            [0, 1], [0, -1],
        ];

        function floodFill(startKey: string) {
            const stack = [startKey];
            const group: Box3[] = [];

            while (stack.length > 0) {
                const key = stack.pop()!;
                if (visited.has(key)) continue;
                visited.add(key);

                const boxes = cellMap.get(key);
                if (boxes) group.push(...boxes);

                const [cx, cz] = key.split("_").map(Number);

                for (const [dx, dz] of dirs) {
                    const k2 = `${cx + dx}_${cz + dz}`;
                    if (!visited.has(k2) && cellMap.has(k2)) {
                        stack.push(k2);
                    }
                }
            }

            return group;
        }

        for (const key of cellMap.keys()) {
            if (!visited.has(key)) {
                const cluster = floodFill(key);
                if (cluster.length > 0) clusters.push(cluster);
            }
        }

        // 4. Merge each cluster into a building box
        const result = [];

        for (const cluster of clusters) {
            const combined = new Box3();
            for (const b of cluster) combined.union(b);

            const size = new Vector3();
            const center = new Vector3();
            combined.getSize(size);
            combined.getCenter(center);

            // filter tiny clusters
            if (size.x < 5 || size.z < 5) continue;

            result.push({ center, size });
        }

        return result;
    }, [glb]);

    return (
        <group>
            {buildings.map((b, i) => (
                <mesh key={i} position={b.center}>
                    <boxGeometry args={[b.size.x, b.size.y, b.size.z]} />
                    <meshStandardMaterial
                        wireframe
                        color="yellow"
                        opacity={0.9}
                        transparent
                    />
                </mesh>
            ))}
        </group>
    );
}
