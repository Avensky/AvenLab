import { useMemo } from "react";
import { Box3, Mesh, Vector3, Object3D } from "three";
// import { type JSX } from "react";

interface Props {
    glb: Object3D;
}

export function CityBuildingColliders({ glb }: Props) {
    const boxes = useMemo(() => {
        const results: { center: Vector3; size: Vector3 }[] = [];

        glb.traverse((obj) => {
            if (obj instanceof Mesh) {
                const box = new Box3().setFromObject(obj);

                const size = new Vector3();
                const center = new Vector3();
                box.getSize(size);
                box.getCenter(center);

                // ignore terrain (huge box)
                if (size.y < 3) return; // filter ground-level small objects

                results.push({ center, size });
            }
        });

        return results;
    }, [glb]);

    return (
        <group>
            {boxes.map((b, i) => (
                <mesh key={i} position={b.center}>
                    <boxGeometry args={[b.size.x, b.size.y, b.size.z]} />
                    <meshStandardMaterial color="red" wireframe />
                </mesh>
            ))}
        </group>
    );
}
