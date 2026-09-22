import { 
    // useNetworkStore, 
    useWorldStore } from "../store";
// import { DebugColliders } from "../components/debugger/DebugColliders";
// import { BlueTeamBaseGround } from "./BlueTeamBaseGround";
import { CityGeometry } from "./CityGeometry";
import { Environment, Sky } from "@react-three/drei";
// import {PhysicsFloor} from "./PhysicsFloor";



export function CityScene() {

    // const activeBlock = useSnapshotStore((s) => s.activeBlock);
    const mode = useWorldStore((s) => s.mode);
    // const debug = useNetworkStore((s) => s.debugOverlay);

    return (
        <group name="city-scene">

            {/* Lighting */}
            {/* <ambientLight intensity={0.1} /> */}

            <Sky
                distance={450000}
                sunPosition={[-50, 15, -30]}
                inclination={0.01}       // darker sky
                azimuth={0.25}
                turbidity={1}           // haze
                rayleigh={0.01}         // reduce brightness
            />

            {/* --- FOG (night atmosphere) --- */}
            <fog attach="fog" args={['#0d0d1a', 10, 150]} />

            <Environment preset="night" />

            {/* <PhysicsFloor /> */}

            <directionalLight intensity={8} position={[10, 20, 10]} />

            {/* {(mode === "collider" || mode === "hybrid") && debug && (
                <DebugColliders boxes={debug.block_boxes} />
            )} */}


            {(mode === "glb" || mode === "hybrid") && (
                <CityGeometry />
            )}

            {/* <BlueTeamBaseGround /> */}
        </group>
    );
}
