import { type JSX } from "react";

type ChassisColliderProps = JSX.IntrinsicElements["mesh"] & {
    color?: string;
};

export function ChassisCollider({ color = "orange", ...props }: ChassisColliderProps) {
    return (
        <mesh {...props}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} wireframe />
        </mesh>
    );
}
