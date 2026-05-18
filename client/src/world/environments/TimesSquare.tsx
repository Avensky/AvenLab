import React from 'react'
import { Environment, useGLTF } from "@react-three/drei"
type GroupProps = React.JSX.IntrinsicElements['group']

export default function TimesSquare(props: GroupProps) {
    const { scene } = useGLTF('/models/city_time_square.glb')
    return <group scale={8.5}>
        <Environment preset="night" />
        <primitive object={scene} {...props} />;
    </group>
}