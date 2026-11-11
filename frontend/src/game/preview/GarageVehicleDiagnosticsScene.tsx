import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Group, SpotLight, Vector3, type InstancedMesh, type Mesh } from "three";
import { AE_HINGE, lensProfiles } from "../../vehicles/tools/roadLamps";
import { prepareRoadLampSurface } from "../../vehicles/tools/roadLampSurface";
import { EMPTY_GARAGE_TEST, garageLampState, garageMounts, useGarageDiagnostics } from "./garageDiagnosticsStore";
import type { VehiclePartHinge } from "./vehiclePartRig";

const xAxis = new Vector3(1, 0, 0);
const popupPivot = new Vector3(...AE_HINGE);

export function GarageVehicleDiagnosticsScene({ vehicle, popup }: { vehicle: string; popup?: VehiclePartHinge }) {
  const test = useGarageDiagnostics(state => state.tests[vehicle] ?? EMPTY_GARAGE_TEST);
  const headlights = useMemo(() => garageMounts(vehicle, "headlights", test), [vehicle, test]);
  const exhaust = useMemo(() => garageMounts(vehicle, "exhaust", test), [vehicle, test]);
  const lens = useMemo(() => lensProfiles[vehicle] && prepareRoadLampSurface(lensProfiles[vehicle], 1), [vehicle]);
  const lampCount = headlights.length;
  const beams = useMemo(() => {
    const root = new Group();
    const lamps = Array.from({ length: lampCount }, () => {
      const lamp = new SpotLight(0xffe9c3, 75, 10, Math.PI / 7, .52, 2);
      lamp.visible = false;
      root.add(lamp, lamp.target);
      return lamp;
    });
    return { root, lamps };
  }, [lampCount]);
  const overlay = useRef<InstancedMesh>(null);
  const mountMarkers = useRef<Array<Mesh | null>>([]);
  const flames = useRef<Array<Mesh | null>>([]);
  const drawPosition = useRef(new Vector3());
  useEffect(() => () => lens?.dispose(), [lens]);
  useEffect(() => () => { for (const lamp of beams.lamps) lamp.dispose(); }, [beams]);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    const lift = popup?.angle ?? 0;
    const active = test.lights !== "off";
    const high = test.lights === "high";
    if (lens && overlay.current) {
      const [mode, brake, left, right] = garageLampState(test, elapsed);
      overlay.current.count = mode || brake || left || right ? 1 : 0;
      if (lens.state.getX(0) !== mode || lens.state.getY(0) !== brake ||
          lens.state.getZ(0) !== left || lens.state.getW(0) !== right ||
          lens.lift.getX(0) !== Math.fround(lift)) {
        lens.state.setXYZW(0, mode, brake, left, right);
        lens.lift.setX(0, lift);
        lens.state.needsUpdate = lens.lift.needsUpdate = true;
      }
    }
    if (test.markers || active) {
      for (const [index, at] of headlights.entries()) {
        const point = drawPosition.current.fromArray(at);
        if (popup) point.sub(popupPivot).applyAxisAngle(xAxis, lift).add(popupPivot);
        mountMarkers.current[index]?.position.copy(point);
        const beam = beams.lamps[index];
        beam.visible = active;
        beam.position.copy(point);
        beam.target.position.set(point.x + Math.sign(point.x) * .18, point.y + (high ? .05 : -.32), point.z + 6);
        beam.intensity = high ? 135 : 75;
      }
    } else {
      for (const beam of beams.lamps) beam.visible = false;
    }
    if (test.nitrous) {
      for (const [index, [x, y, z]] of exhaust.entries()) {
        const pulse = .84 + .16 * Math.sin(elapsed * 32 + index * 2);
        for (let layer = 0; layer < 2; layer++) {
          const mesh = flames.current[index * 2 + layer];
          if (!mesh) continue;
          const length = (layer ? .44 : .76) * pulse, radius = layer ? .06 : .095;
          mesh.position.set(x, y, z - length / 2);
          mesh.scale.set(radius, length, radius);
        }
      }
    }
  });

  return <>
    {lens && <instancedMesh ref={overlay} args={[lens.geometry, lens.material, 1]} count={0}
      frustumCulled={false} renderOrder={2} dispose={null} />}
    <primitive object={beams.root} />
    {test.markers && <>
      {headlights.map((position, index) => <mesh key={`head-${index}`} position={[...position]}
        ref={mesh => { mountMarkers.current[index] = mesh; }} renderOrder={8}>
        <sphereGeometry args={[.039, 10, 8]} />
        <meshBasicMaterial color="#ffd789" depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>)}
      {exhaust.map((position, index) => <mesh key={`exhaust-${index}`} position={[...position]} renderOrder={8}>
        <sphereGeometry args={[.039, 10, 8]} />
        <meshBasicMaterial color="#52c7ff" depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>)}
    </>}
    {test.nitrous && exhaust.flatMap((_, index) => [0, 1].map(layer => (
      <mesh key={`flame-${index}-${layer}`} rotation={[-Math.PI / 2, 0, 0]}
        ref={mesh => { flames.current[index * 2 + layer] = mesh; }}>
        <coneGeometry args={[1, 1, 9]} />
        <meshBasicMaterial color={layer ? "#55aeff" : "#ff482b"} transparent depthWrite={false}
          blending={AdditiveBlending} toneMapped={false} />
      </mesh>
    )))}
  </>;
}
