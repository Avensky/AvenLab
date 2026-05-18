import { Suspense } from "react";
import type { PropsWithChildren } from 'react';
// import { Suspense, useEffect, useMemo, useRef, useState } from "react";
// import { Environment, OrbitControls, PerspectiveCamera, Sky, Stats, useGLTF } from '@react-three/drei';
// import { Intro } from "../ui/Intro";
// import { dpr, levelLayer, useStore } from "../store";
// import { Help, Speed, LeaderBoard, PickColor, Editor, Finished, Minimap, Clock } from "../ui";
// import { useToggle } from "../useToggle";
// import { OrbitControls as ThreeOrbitControls } from 'three-stdlib';

interface GameSceneProps {
    playerId: string
    children: PropsWithChildren
    VehicleComponent: React.ComponentType<{ playerId: string; children?: React.ReactNode }>
    MapComponent: React.ComponentType
}


export default function GameScene({ playerId, children, VehicleComponent, MapComponent }: PropsWithChildren<GameSceneProps>) {
    // const controlsRef = useRef<ThreeOrbitControls | null>(null);
    // const layers = new Layers()
    // layers.enable(levelLayer)
    // const [screen, setScreen] = useState<Screen>("vehicle");
    // const [selectedVehicle, setSelectedVehicle] = useState<"ae86" | "camaro" | "tank" | null>(null);
    // const [selectedMap, setSelectedMap] = useState<string | null>(null);
    // const [gameMode, setGameMode] = useState<string | null>(null);
    // const [light, setLight] = useState<DirectionalLight | null>(null)
    // const { onCheckpoint, onFinish, onStart } = actions
    // const ToggledCheckpoint = useToggle(Checkpoint, 'checkpoint')
    // const ToggledDebug = useToggle(Debug, 'debug')
    // const ToggledEditor = useToggle(Editor, 'editor')
    // const ToggledFinished = useToggle(Finished, 'finished')
    // const ToggledMap = useToggle(Minimap, 'map')
    // const ToggledStats = useToggle(Stats, 'stats')
    // const [actions, dpr, editor, shadows] = useStore((s) => [s.actions, s.dpr, s.editor, s.shadows])
    // const ToggledOrbitControls = useToggle(OrbitControls, 'editor')
    // console.log('Game Started');

    return (
        <>
            {/* <Intro> */}
            {/* <ToggledDebug> */}
            <Suspense fallback={null}>
                <VehicleComponent playerId={playerId} >
                    {children}
                </VehicleComponent>
                <MapComponent />
            </Suspense >
            {/* </ToggledDebug> */}
            {/* <ToggledMap /> */}
            {/* <ToggledOrbitControls /> */}
            {/* <PickColor /> */}
            {/* </Intro > */}
        </>
    )
}
