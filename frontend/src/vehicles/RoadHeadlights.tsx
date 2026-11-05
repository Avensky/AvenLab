import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, SpotLight } from 'three';
import { useFleetPoseReader } from '../hooks/usePhysicsInterpolator';
import { VehicleFlags } from '../store/input/protocol/inputMasks';
import type { RosterEntity } from './rosterSelector';
import { applyHeadlightBeam } from './tools/headlightBeam';
import { lampFloor, positions } from './tools/roadLamps';

// Two real road lights for the driver. Remote lenses are drawn by ExteriorMarkers.
export function RoadHeadlights({car}: {car:RosterEntity}) {
  const read = useFleetPoseReader();
  const head = positions[car.vehicle_id ?? '']?.head;
  const rig = useMemo(() => {
    const root = new Group();
    const lights = [-1,1].map(side => {
      const lamp = new SpotLight(0xfff3dd, 1400, 78, Math.PI/7, .50, 2);
      lamp.visible = false;
      if (head) lamp.position.set(side*head[0], head[1], head[2]);
      lamp.target.position.set(lamp.position.x+side*.65, lamp.position.y-1.2, lamp.position.z+32);
      root.add(lamp,lamp.target);
      return lamp;
    });
    return {root, lights};
  },[head]);
  useEffect(() => () => rig.lights.forEach(light=>light.dispose()),[rig]);
  useFrame(() => {
    const pose = read(car.id);
    rig.root.visible = Boolean(pose && head);
    if (!pose || !head) return;
    rig.root.position.fromArray(pose.position);
    rig.root.quaternion.fromArray(pose.rotation);
    rig.root.translateY(lampFloor(car));
    const high = Boolean((pose.cluster_mask ?? 0) & 8);
    const on = high || Boolean((pose.vehicle_mask ?? 0) & VehicleFlags.HEADLIGHTS);
    for (const lamp of rig.lights) applyHeadlightBeam(lamp,on,high);
  });
  return <primitive object={rig.root}/>;
}
