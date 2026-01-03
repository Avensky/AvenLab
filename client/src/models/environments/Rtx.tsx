import React from 'react'
import { Environment, Sky, useGLTF } from "@react-three/drei"
import { Layers } from "three"
import { levelLayer } from "../../store"

type GroupProps = React.JSX.IntrinsicElements['group']

export default function Rtx(props: GroupProps) {

    const layers = new Layers()
    layers.enable(levelLayer)

    const { scene } = useGLTF('/models/city_rtx.glb')

    return (
        <group scale={2.5}>
            {/* --- SKY (darker) --- */}
            <Sky
                distance={450000}
                sunPosition={[-50, 15, -30]}
                inclination={0.1}       // darker sky
                azimuth={0.25}
                turbidity={10}           // haze
                rayleigh={0.1}           // reduce brightness
            />

            {/* --- LIGHTING --- */}
            <directionalLight
                position={[-50, 15, -30]}
                intensity={0.6}           // much lower for night
                color={"#ffb38a"}         // subtle warm light
                castShadow
            />

            <directionalLight
                position={[30, 20, 50]}
                intensity={0.2}           // very subtle fill
                color={"#7fa6ff"}
            />

            <ambientLight intensity={0.05} color={"#001122"} />  {/* very dark ambient */}

            {/* --- FOG (night atmosphere) --- */}
            <fog attach="fog" args={['#0d0d1a', 10, 150]} />

            {/* --- CITY MODEL --- */}
            <primitive object={scene} {...props} />

            {/* --- GLOBAL ENVIRONMENT --- */}
            <Environment preset="night" background={false} />
        </group>

    )
}
