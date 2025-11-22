import { type JSX } from "react";

export function ColliderVisualizer(props: JSX.IntrinsicElements["mesh"]) {
    return (
        <mesh {...props}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="cyan" wireframe />
        </mesh>
    );
}
