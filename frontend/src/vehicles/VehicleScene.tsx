// src/vehicles/VehicleScene.tsx
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

import { DebugWheelVisualizer } from "../components/debugger/DebugWheelVisualizer";
import { GeometryVisualizer } from "./GeometryVisualizer";
import { DebugAntiRollBarVisualizer } from "../components/debugger/DebugAntiRollBarVisualizer";
import { DebugSlipAngleVisualizer } from "../components/debugger/DebugSlipAngleVisualizer";
import { DebugSpringVisualizer } from "../components/debugger/DebugSpringVisualizer";
import { ChassisCollider } from "../components/debugger/ChassisCollider";
import { DebugFlags, hasDebugFlag } from "../store/tools/debugMasks";
import { useNetworkStore, useWorldStore } from "../store";
import { useDebugViewStore } from "../store/debugViewStore";
import { VehicleRoster } from "./VehicleRoster";

export function VehicleScene() {
    const snapshot = useNetworkStore((s) => s.snapshot);
    const playerId = useNetworkStore((s) => s.playerId);
    const debug = useNetworkStore((s) => s.debugOverlay);

    const playerScope = useDebugViewStore((s) => s.playerScope);

    const mode = useWorldStore((s) => s.mode);
    const debugMask = useWorldStore((s) => s.debugMask);

    const showChassis = hasDebugFlag(
        debugMask,
        DebugFlags.CHASSIS
    );
    const showWheels = hasDebugFlag(
        debugMask,
        DebugFlags.WHEELS
    );
    const showLoadBars = hasDebugFlag(
        debugMask,
        DebugFlags.LOAD_BARS
    );
    const showAntiRollBars = hasDebugFlag(
        debugMask,
        DebugFlags.ARB
    );
    const showSlipAngles = hasDebugFlag(
        debugMask,
        DebugFlags.SLIP
    );
    const showSprings = hasDebugFlag(
        debugMask,
        DebugFlags.RAYS
    );

    if (!snapshot || !playerId) return null;

    const isVisiblePlayer = (debugPlayerId: string) =>
        playerScope === "all" || debugPlayerId === playerId;

    const chassis = (debug?.chassis ?? []).filter((item) =>
        isVisiblePlayer(item.player_id)
    );

    const wheels = (debug?.wheels ?? []).filter((item) =>
        isVisiblePlayer(item.player_id)
    );

    const suspensionRays = (
        debug?.suspension_rays ?? []
    ).filter((item) => isVisiblePlayer(item.player_id));

    const slipVectors = (
        debug?.slip_vectors ?? []
    ).filter((item) => isVisiblePlayer(item.player_id));

    const loadBars = (debug?.load_bars ?? []).filter(
        (item) => isVisiblePlayer(item.player_id)
    );

    const arbLinks = (debug?.arb_links ?? []).filter(
        (item) => isVisiblePlayer(item.player_id)
    );

    /*
     * Keep wheel/ray pairing separate for each player.
     * A global wheels[index] lookup can connect player two's
     * spring to player one's wheel.
     */
    const wheelsByPlayer = new Map<string, typeof wheels>();

    for (const wheel of wheels) {
        const playerWheels =
            wheelsByPlayer.get(wheel.player_id) ?? [];

        playerWheels.push(wheel);
        wheelsByPlayer.set(wheel.player_id, playerWheels);
    }

    const nextRayIndexByPlayer = new Map<string, number>();

    const springs = suspensionRays.flatMap((ray) => {
        const wheelIndex =
            nextRayIndexByPlayer.get(ray.player_id) ?? 0;

        nextRayIndexByPlayer.set(
            ray.player_id,
            wheelIndex + 1
        );

        const wheel =
            wheelsByPlayer.get(ray.player_id)?.[wheelIndex];

        if (!ray.hit || !wheel) {
            return [];
        }

        const start = new THREE.Vector3(...ray.origin);
        const end = new THREE.Vector3(...wheel.center);

        const direction = new THREE.Vector3(
            ...ray.direction
        ).normalize();

        const maximumSpringLength = Math.max(
            ray.length - wheel.radius,
            0.001
        );

        const currentSpringLength =
            start.distanceTo(end);

        const ratio = THREE.MathUtils.clamp(
            1 -
                currentSpringLength /
                    maximumSpringLength,
            0,
            1
        );

        const restEnd = start
            .clone()
            .addScaledVector(
                direction,
                maximumSpringLength
            );

        return [
            {
                start: start.toArray() as [
                    number,
                    number,
                    number,
                ],
                end: end.toArray() as [
                    number,
                    number,
                    number,
                ],
                restEnd: restEnd.toArray() as [
                    number,
                    number,
                    number,
                ],
                ratio,
            },
        ];
    });

    return (
        <>
            <OrbitControls />

            {(mode === "glb" || mode === "hybrid") && (
                <VehicleRoster />
            )}

            {mode === "geometry" && (
                <>
                    {showWheels && (
                        <DebugWheelVisualizer
                            wheels={wheels}
                        />
                    )}

                    {showChassis &&
                        chassis.map((item) => (
                            <GeometryVisualizer
                                key={item.player_id}
                                chassis={item}
                                color="white"
                                opacity={0.5}
                                mode={mode}
                            />
                        ))}
                </>
            )}

            {showLoadBars && (
                <DebugAntiRollBarVisualizer
                    links={loadBars}
                />
            )}

            {showAntiRollBars && (
                <DebugAntiRollBarVisualizer
                    links={arbLinks}
                />
            )}

            {showSlipAngles && (
                <DebugSlipAngleVisualizer
                    slips={slipVectors}
                />
            )}

            {showSprings && (
                <DebugSpringVisualizer
                    springs={springs}
                    opacity1={0.8}
                    opacity2={0.3}
                />
            )}

            {(mode === "collider" ||
                mode === "hybrid") && (
                <>
                    {showWheels && (
                        <DebugWheelVisualizer
                            wheels={wheels}
                        />
                    )}

                    {showChassis &&
                        chassis.map((item) => (
                            <ChassisCollider
                                key={item.player_id}
                                position={item.position}
                                quaternion={item.rotation}
                                scale={
                                    item.half_extents.map(
                                        (value) =>
                                            value * 2
                                    ) as [
                                        number,
                                        number,
                                        number,
                                    ]
                                }
                            />
                        ))}
                </>
            )}
        </>
    );
}
