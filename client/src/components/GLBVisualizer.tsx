
import { useGLTF } from "@react-three/drei";
import { type JSX } from "react";

export function GLBVisualizer(props: JSX.IntrinsicElements["group"]) {
    const { scene } = useGLTF("/models/camaro.glb");
    return <primitive {...props} object={scene} scale={0.01} />;
}
