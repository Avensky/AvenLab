import { useGLTF } from "@react-three/drei";
import { type JSX } from "react";

export function CityScene(props: JSX.IntrinsicElements["group"]) {
    const { scene } = useGLTF("/models/city.glb");
    return (
        <primitive
            {...props}
            object={scene}
            scale={1.0}
        />
    );
}
