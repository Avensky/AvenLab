import { useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils } from 'three';
import { useVehiclePhysicsInterpolator } from '../hooks/usePhysicsInterpolator';
import { useVehicleVisualAlignment } from '../hooks/useVehicleVisualAlignment';
import { useLiveAppearance } from './cosmetics/useLiveAppearance';
import { applyBackendWheelPose, extractWheelAssembly, type WheelCorner } from './tools/vehicleVisualRig';
import { VEHICLE_MODEL_PATHS } from './tools/vehicleModelPaths';

const corners = ['fl', 'fr', 'rl', 'rr'] as const;

/** The exported hub is the steering/suspension pivot. Only SPIN carries axle
 * rotation; its sibling CALIPER follows the wheel around corners. */
export function SocketCar({ entityId, model }: { entityId: string; model: "enforcer" | "interceptor" | "charger70" | "skyline34" | "timecar" | "cx30" | "mini" | "fortuner" | "landcruiser" | "sierra" }) {
  const { scene } = useGLTF(VEHICLE_MODEL_PATHS[model], "/draco/");
  const body = useRef<Group>(null), visual = useRef<Group>(null);
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);
  const rig = useMemo(() => {
    const root = scene.clone(true);
    const wheels = corners.map(corner => extractWheelAssembly(root, {
      corner, rootNames: ['WHEEL_' + corner.toUpperCase()],
      isFixedPart: child => child.name === 'CALIPER_' + corner.toUpperCase(),
    }));
    return { root, wheels, carriers: wheels.map(w => w?.carrier ?? null) };
  }, [scene]);
  const assembly=useRef<Group>(null);
  const spin = useRef([0, 0, 0, 0]);
  useVehicleVisualAlignment(model, entityId, visual, rig.carriers);
  useLiveAppearance(visual, model, entityId);
  useFrame((_, delta) => {
    const pose = getInterpolated(entityId);
    if (!assembly.current || !body.current) return;
    assembly.current.visible=!!pose;
    if (!pose) return;
    body.current.position.fromArray(pose.position);
    body.current.quaternion.fromArray(pose.rotation);
    for (const wheel of pose.wheels ?? []) {
      const i = corners.indexOf(wheel.id.toLowerCase() as WheelCorner);
      const assembly = rig.wheels[i];
      if (!assembly) continue;
      spin.current[i] = MathUtils.euclideanModulo(spin.current[i] + (wheel.wheel_speed ?? 0) * Math.min(delta, .05), 2*Math.PI);
      applyBackendWheelPose(assembly, wheel.position, wheel.rotation, 0, spin.current[i]);
    }
  });
  return <group ref={assembly} visible={false} dispose={null}>
    <group ref={body}><group ref={visual}><primitive object={rig.root} /></group></group>
    {rig.wheels.map((wheel,i) => wheel && <primitive key={corners[i]} object={wheel.carrier} />)}
  </group>;
}
