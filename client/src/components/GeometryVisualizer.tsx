import { type JSX } from "react";

type GeometryVisualizerProps = JSX.IntrinsicElements["mesh"] & {
    color?: string;
};

export function GeometryVisualizer({ color = "orange", ...props }: GeometryVisualizerProps) {
    return (
        <mesh {...props}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={color} />
        </mesh>
    );
}