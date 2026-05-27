// src/vehicles/VehicleScene.tsx
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

import { DebugWheelVisualizer } from "../components/debugger/DebugWheelVisualizer";
import { GeometryVisualizer } from "./GeometryVisualizer";
import { DebugAntiRollBarVisualizer } from "../components/debugger/DebugAntiRollBarVisualizer";
import { DebugSlipAngleVisualizer } from "../components/debugger/DebugSlipAngleVisualizer";
import { DebugSpringVisualizer } from "../components/debugger/DebugSpringVisualizer";
import { ChassisCollider } from "../components/debugger/ChassisCollider";

import { useNetworkStore, useWorldStore } from "../store";
import { VehiclePreviewModel } from "../game/preview";

export function VehicleScene() {
  const snapshot = useNetworkStore((s) => s.snapshot);
  const playerId = useNetworkStore((s) => s.playerId);
  const debug = useNetworkStore((s) => s.debugOverlay);
  const mode = useWorldStore((s) => s.mode);
  const me = useNetworkStore((s) => s.getMe());

  if (!snapshot || !playerId || !me) return null;
  if (!debug) return null;

  const springs = debug.suspension_rays
    .map((r, i) => {
      const wheel = debug.wheels[i];
      if (!r.hit || !wheel) return null;

      const normal = new THREE.Vector3(0, 1, 0);
      const hit = new THREE.Vector3(...r.hit);

      const end = hit.clone().add(normal.multiplyScalar(wheel.radius));
      const start = new THREE.Vector3(...r.origin);

      const restEnd = start
        .clone()
        .addScaledVector(normal, -(r.length - wheel.radius));

      const length = start.distanceTo(end);
      const ratio = 1 - Math.min(length / r.length, 1);

      return {
        start: start.toArray() as [number, number, number],
        end: end.toArray() as [number, number, number],
        restEnd: restEnd.toArray() as [number, number, number],
        ratio,
      };
    })
    .filter(Boolean) as {
    start: [number, number, number];
    end: [number, number, number];
    restEnd: [number, number, number];
    ratio: number;
  }[];

  console.log("debug wheels", debug.wheels.length, debug.wheels[0]);

  return (
    <>
      <OrbitControls />

      {(mode === "glb" || mode === "hybrid") && <VehiclePreviewModel />}

      {mode === "geometry" && (
        <>
          <DebugWheelVisualizer wheels={debug.wheels}/>

          <GeometryVisualizer
            chassis={debug.chassis}
            color="white"
            opacity={0.5}
            mode={mode}
          />

          <DebugAntiRollBarVisualizer links={debug.arb_links} />

          <DebugSlipAngleVisualizer
            slips={debug.slip_vectors}
            vehiclePosition={me.position}
            vehicleQuaternion={me.rotation}
          />

          <DebugSpringVisualizer
            springs={springs}
            opacity1={0.8}
            opacity2={0.3}
            vehiclePosition={me.position}
            vehicleQuaternion={me.rotation}
          />
        </>
      )}

      {mode === "collider" && (
        <>
          <DebugWheelVisualizer wheels={debug.wheels}/>

          {debug.chassis && (
            <ChassisCollider
              position={debug.chassis.position}
              quaternion={debug.chassis.rotation}
              scale={debug.chassis.half_extents.map((v: number) => v * 2) as [
                number,
                number,
                number
              ]}
            />
          )}
        </>
      )}

      {mode === "hybrid" && (
        <>
          <DebugWheelVisualizer wheels={debug.wheels}/>

          {debug.chassis && (
            <ChassisCollider
              position={debug.chassis.position}
              quaternion={debug.chassis.rotation}
              scale={debug.chassis.half_extents.map((v: number) => v * 2) as [
                number,
                number,
                number
              ]}
            />
          )}
        </>
      )}
    </>
  );
}