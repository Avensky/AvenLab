import { type JSX } from "react";

type ColliderVisualizerProps = JSX.IntrinsicElements["mesh"] & {
    color?: string;
};

export function ColliderVisualizer({ color = "orange", ...props }: ColliderVisualizerProps) {
    return (
        <mesh {...props}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} wireframe />
        </mesh>
    );
}
