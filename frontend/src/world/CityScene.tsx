import { 
    useNetworkStore, 
    useWorldStore } from "../store";
import { DebugColliders } from "../components/debugger/DebugColliders";
// import { BlueTeamBaseGround } from "./BlueTeamBaseGround";
import { CityGeometry } from "./CityGeometry";
import { Environment, Stars } from "@react-three/drei";
// import {PhysicsFloor} from "./PhysicsFloor";



export function CityScene() {

    // const activeBlock = useSnapshotStore((s) => s.activeBlock);
    const mode = useWorldStore((s) => s.mode);
    const debug = useNetworkStore((s) => s.debugOverlay);

    return (
        <group name="city-scene">

            {/* Lighting */}
            {/* <ambientLight intensity={0.1} /> */}


            {/* --- NIGHT SKY --- */}
            <color attach="background" args={["#02040a"]} />

            <Stars
                radius={500}
                depth={80}
                count={1200}
                factor={3}
                saturation={0.1}
                fade
                speed={0.15}
            />

            {/* --- NIGHT ATMOSPHERE --- */}
            <fog attach="fog" args={["#050914", 250, 1100]} />

            {/* Reflections / material lighting */}
            <Environment
                preset="night"
                background={false}
            />

            {/* Soft sky fill so shadowed geometry is not completely black */}
            <hemisphereLight
                args={["#526889", "#08090c", 0.45]}
            />

            {/* Moonlight */}
            <directionalLight
                color="#9fbfff"
                intensity={1.8}
                position={[-120, 180, -80]}
                castShadow
            />


            {/* <PhysicsFloor /> */}


            {(mode === "collider" || mode === "hybrid") && debug && (
                <DebugColliders boxes={debug.block_boxes} />
            )}


            {(mode === "glb" || mode === "hybrid") && (
                <CityGeometry />
            )}

        </group>
    );
}
