import {advanceTankHatches} from './tools/tankHatches';
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import { Group, Vector3, Quaternion, type Object3D } from "three";
import {worldAim} from '../combat/turretPresentation';
import {weaponVisuals} from "../combat/weaponVisuals";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { getTankParts } from "./tools/getTankParts";
import { useNetworkStore } from "../store/session/networkStore";
import { useUIStore } from "../store/menus/uiStore";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { useVehicleVisualAlignment } from "../hooks/useVehicleVisualAlignment";

interface TankProps extends PropsWithChildren {
  entityId?: string;
  turretRotation?: number;
  cannonElevation?: number;
}
const MODEL_PATH = "/models/vehicles/tank.glb";
export const Tank = forwardRef<Group, TankProps>(function Tank(
  { children, entityId, turretRotation = 0, cannonElevation = 0 },
  ref,
) {
  const { scene } = useGLTF(MODEL_PATH);
  const root = useRef<Group>(null!);
  const visual = useRef<Group>(null!);
  const turret = useRef<Group | null>(null);
  const cannon = useRef<Group | null>(null);
  const forwardGunPitch=useRef<Group|null>(null);
  const recoil=useRef<Group|null>(null),wheelPivots=useRef<Object3D[]>([]);
  useImperativeHandle(ref, () => root.current, []);
  const localId = useNetworkStore((s) => s.playerId);
  const preview = useUIStore(
    (s) => s.screen === "sandbox_setup" || s.screen === "signal_recon_setup",
  );

  const shot=useRef({number:-1,time:-100});
  const previousValid=useRef(false);
  const scratch=useMemo(()=>({local:new Vector3(),inverse:new Quaternion(),forward:new Vector3(),distance:new Vector3(),previous:new Vector3()}),[]);
  const { model, parts, turretY, cannonX } = useMemo(() => {
    const model = scene.clone(true);
    const parts = getTankParts(model);
    return {
      model,
      parts,
      turretY: parts.turret?.rotation.y ?? 0,
      cannonX: parts.cannon?.rotation.x ?? 0,
    };
  }, [scene]);
  useLayoutEffect(() => {
    turret.current = parts.turret;
    cannon.current = parts.cannon;
    forwardGunPitch.current=parts.forwardGun.pitch;
    recoil.current=parts.recoil;wheelPivots.current=parts.wheels;
    return()=>[...parts.hatches.ownedGeometries,...parts.forwardGun.ownedGeometries].forEach(geometry=>geometry.dispose());
  }, [parts]);
  useLayoutEffect(()=>{const id=entityId??localId;if(!id)return;
    const anchors={cannon:parts.muzzle,coax:parts.coax,basket:parts.forwardGun.muzzle};weaponVisuals.set(id,anchors);
    return()=>{if(weaponVisuals.get(id)===anchors)weaponVisuals.delete(id);};
  },[parts,entityId,localId]);
  useVehicleVisualAlignment("tank", entityId, visual, parts.wheels, preview);
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);
  useFrame(({clock},dt) => {
    if (preview || !root.current) return;
    const pose = getInterpolated(entityId ?? localId);
    if (!pose) {previousValid.current=false;return;}
    root.current.position.fromArray(pose.position);
    root.current.quaternion.fromArray(pose.rotation);
    const combat=pose.combat;
    advanceTankHatches(parts.hatches,combat?.enabled??true,dt);
    if(combat?.role==='tank'){
      const local=worldAim(scratch.local,combat.yaw,combat.pitch).applyQuaternion(scratch.inverse.copy(root.current.quaternion).invert());
      const locked=combat.hull_locked&&combat.lock_yaw!==undefined;
      if(turret.current)turret.current.rotation.y=locked?combat.lock_yaw!:Math.atan2(local.x,local.z);
      if(cannon.current)cannon.current.rotation.x=locked?-(combat.lock_pitch??0):-Math.atan2(local.y,Math.hypot(local.x,local.z));
    }else{
      if(turret.current)turret.current.rotation.y=turretY+turretRotation;
      if(cannon.current)cannon.current.rotation.x=cannonX+cannonElevation;
    }
    if(forwardGunPitch.current)forwardGunPitch.current.rotation.x=cannon.current?.rotation.x??0;
    const cannonShot=combat?.cannon_shot??combat?.shot;
    if(cannonShot!==undefined && cannonShot!==shot.current.number){shot.current={number:cannonShot,time:shot.current.number<0?-100:clock.elapsedTime};}
    if(recoil.current)recoil.current.position.z=-.48*Math.exp(-(clock.elapsedTime-shot.current.time)/.12);
    if(previousValid.current && dt>0 && dt<.1){
      const forward=scratch.forward.set(0,0,1).applyQuaternion(root.current.quaternion);
      const distance=scratch.distance.subVectors(root.current.position,scratch.previous).dot(forward);
      if(Math.abs(distance)<2)for(const wheel of wheelPivots.current)wheel.rotateX(distance/.35);
    }
    scratch.previous.copy(root.current.position);previousValid.current=true;
  });
  return (
    <group ref={root}>
      <group ref={visual}>
        <primitive object={model} />
      </group>
      {children}
    </group>
  );
});
export default Tank;
