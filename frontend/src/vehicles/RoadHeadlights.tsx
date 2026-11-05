import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, SpotLight, Vector3 } from 'three';
import { useFleetPoseReader } from '../hooks/usePhysicsInterpolator';
import { VehicleFlags } from '../store/input/protocol/inputMasks';
import type { RosterEntity } from './rosterSelector';
import { applyHeadlightBeam } from './tools/headlightBeam';
import { AE_HINGE, lensProfiles, placeModel, popupAngle } from './tools/roadLamps';

// Two real road lights for the driver. Remote lenses are drawn by ExteriorMarkers.
export function RoadHeadlights({car}: {car:RosterEntity}) {
  const read = useFleetPoseReader();
  const lift=useRef(0);
  const mounts = lensProfiles[car.vehicle_id ?? '']?.mounts;
  const rig = useMemo(() => {
    const root = new Group();
    const lights = (mounts??[]).map(at => {
      const side=Math.sign(at[0]);
      const lamp = new SpotLight(0xfff3dd, 1400, 78, Math.PI/7, .50, 2);
      lamp.visible = false;
      lamp.position.fromArray(at);
      lamp.target.position.set(lamp.position.x+side*.65, lamp.position.y-1.2, lamp.position.z+32);
      root.add(lamp,lamp.target);
      return lamp;
    });
    return {root, lights, offset:new Vector3()};
  },[mounts]);
  useEffect(() => () => rig.lights.forEach(light=>light.dispose()),[rig]);
  useFrame((_,dt) => {
    const pose = read(car.id);
    rig.root.visible = Boolean(pose && mounts);
    if (!pose || !mounts) return;
    rig.root.position.fromArray(pose.position);
    rig.root.quaternion.fromArray(pose.rotation);
    placeModel(rig.root,car,rig.offset);
    const high = Boolean((pose.cluster_mask ?? 0) & 8);
    const on = high || Boolean((pose.vehicle_mask ?? 0) & VehicleFlags.HEADLIGHTS);
    lift.current=popupAngle(lift.current,on,high,dt);
    for (const [i,lamp] of rig.lights.entries()) {
      if(car.vehicle_id==='ae86'){
        const [,y,z]=mounts[i];
        const dy=y-AE_HINGE[1], dz=z-AE_HINGE[2], a=lift.current;
        lamp.position.y=AE_HINGE[1]+dy*Math.cos(a)-dz*Math.sin(a);
        lamp.position.z=AE_HINGE[2]+dy*Math.sin(a)+dz*Math.cos(a);
      }
      applyHeadlightBeam(lamp,on,high);
    }
  });
  return <primitive object={rig.root}/>;
}
