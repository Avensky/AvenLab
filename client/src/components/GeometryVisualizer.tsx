import { type JSX } from "react";

export function GeometryVisualizer(props: JSX.IntrinsicElements["mesh"]) {
    return (
        <mesh {...props}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="orange" />
        </mesh>
    );
}
