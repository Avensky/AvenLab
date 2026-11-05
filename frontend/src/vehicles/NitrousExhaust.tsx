import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, InstancedMesh, Object3D, Vector3 } from 'three';
import { useFleetPoseReader } from '../hooks/usePhysicsInterpolator';
import { VehicleFlags } from '../store/input/protocol/inputMasks';
import type { RosterEntity } from './rosterSelector';
import { exhaustOutlets, lensProfiles, placeModel } from './tools/roadLamps';
import { writeInstanceMatrix } from './writeInstanceMatrix';

const red = new Color('#ff482b'), blue = new Color('#55aeff');
// The cone's base sits at the tailpipe while the tapered end points aft.
export function NitrousExhaust({cars}: {cars:RosterEntity[]}) {
  const batch = useRef<InstancedMesh>(null);
  const read = useFleetPoseReader();
  const scratch = useMemo(() => ({body:new Object3D(), flame:new Object3D(), offset:new Vector3()}),[]);
  const capacity = Math.max(1, cars.reduce((n,car) => n + (exhaustOutlets[car.vehicle_id ?? '']?.length ?? 0)*2, 0));
  useFrame(({clock}) => {
    if (!batch.current) return;
    let count = 0;
    const {body,flame} = scratch;
    for (const car of cars) {
      const id=car.vehicle_id??'';
      const slots=exhaustOutlets[id];
      if (!slots) continue;
      const pose = read(car.id);
      if (!pose || !((pose.vehicle_mask ?? 0) & VehicleFlags.BOOST) ||
          pose.guard?.remaining_s || pose.combat?.ram_remaining || pose.combat?.stun_remaining) continue;
      body.position.fromArray(pose.position); body.quaternion.fromArray(pose.rotation); placeModel(body,car,scratch.offset);
      const floor = lensProfiles[id].floor;
      for (const [index,outlet] of slots.entries()) {
        const pulse = .84 + .16*Math.sin(clock.elapsedTime*32 + index*2);
        for (const core of [false,true]) {
          const length = (core ? .44 : .76)*pulse;
          flame.position.set(outlet[0], floor+outlet[1], outlet[2]-length/2);
          flame.rotation.x = -Math.PI/2;
          flame.scale.set(core ? .060 : .095, length, core ? .060 : .095);
          flame.updateMatrix(); flame.matrix.premultiply(body.matrix);
          writeInstanceMatrix(batch.current,count,flame.matrix);
          if (!batch.current.instanceColor || count >= batch.current.count) batch.current.setColorAt(count,core ? blue : red);
          count++;
        }
      }
    }
    const mesh=batch.current;
    if (count>mesh.count && mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    mesh.count=count;
    if (count) mesh.instanceMatrix.needsUpdate=true;
  });
  return <instancedMesh ref={batch} args={[undefined,undefined,capacity]} count={0} frustumCulled={false}>
    <coneGeometry args={[1,1,9]}/>
    <meshBasicMaterial transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false}/>
  </instancedMesh>;
}
