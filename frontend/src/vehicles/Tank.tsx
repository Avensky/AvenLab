import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import { Group, Vector3, type Object3D } from "three";
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
  const recoil=useRef<Group|null>(null),wheelPivots=useRef<Object3D[]>([]);
  useImperativeHandle(ref, () => root.current, []);
  const localId = useNetworkStore((s) => s.playerId);
  const preview = useUIStore(
    (s) => s.screen === "sandbox_setup" || s.screen === "signal_recon_setup",
  );
  const muzzleFlash=useRef<Group>(null),impactFlash=useRef<Group>(null);
  const shot=useRef({number:-1,time:-100});
  const lastPosition=useRef<Vector3 | null>(null);
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
    recoil.current=parts.recoil;wheelPivots.current=parts.wheels;
  }, [parts]);
  useVehicleVisualAlignment("tank", entityId, visual, parts.wheels, preview);
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);
  useFrame(({clock},dt) => {
    if (preview || !root.current) return;
    const pose = getInterpolated(entityId ?? localId);
    if (!pose) return;
    root.current.position.fromArray(pose.position);
    root.current.quaternion.fromArray(pose.rotation);
    const entity=useNetworkStore.getState().snapshot?.entities.find(e=>e.id===(entityId??localId));
    const combat=entity?.combat;
    if(combat?.role==='tank'){
      const local=new Vector3(-Math.sin(combat.yaw)*Math.cos(combat.pitch),Math.sin(combat.pitch),-Math.cos(combat.yaw)*Math.cos(combat.pitch)).applyQuaternion(root.current.quaternion.clone().invert());
      const locked=combat.hull_locked&&combat.lock_yaw!==undefined;
      if(turret.current)turret.current.rotation.y=locked?combat.lock_yaw!:Math.atan2(local.x,local.z);
      if(cannon.current)cannon.current.rotation.x=locked?-(combat.lock_pitch??0):-Math.atan2(local.y,Math.hypot(local.x,local.z));
    }else{
      if(turret.current)turret.current.rotation.y=turretY+turretRotation;
      if(cannon.current)cannon.current.rotation.x=cannonX+cannonElevation;
    }
    const cannonShot=combat?.cannon_shot??combat?.shot;
    if(cannonShot!==undefined && cannonShot!==shot.current.number){shot.current={number:cannonShot,time:shot.current.number<0?-100:clock.elapsedTime};}
    const age=clock.elapsedTime-shot.current.time;
    if(muzzleFlash.current&&combat){
      const d=new Vector3(-Math.sin(combat.yaw)*Math.cos(combat.pitch),Math.sin(combat.pitch),-Math.cos(combat.yaw)*Math.cos(combat.pitch)).applyQuaternion(root.current.quaternion.clone().invert());
      if(combat.hull_locked&&combat.lock_yaw!==undefined){const yaw=combat.lock_yaw,pitch=combat.lock_pitch??0;d.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));}
      muzzleFlash.current.position.set(combat.x,combat.y,combat.z).addScaledVector(d,4.1);
      muzzleFlash.current.visible=age>=0&&age<.11;muzzleFlash.current.scale.setScalar(.8+age*8);
    }
    if(impactFlash.current){impactFlash.current.visible=Boolean(combat?.impact&&age>=0&&age<.25);if(combat?.impact)impactFlash.current.position.fromArray(combat.impact).sub(root.current.position).applyQuaternion(root.current.quaternion.clone().invert());impactFlash.current.scale.setScalar(1+Math.max(0,age)*10);}
    if(recoil.current)recoil.current.position.z=-.48*Math.exp(-(clock.elapsedTime-shot.current.time)/.12);
    if(lastPosition.current && dt>0 && dt<.1){
      const forward=new Vector3(0,0,1).applyQuaternion(root.current.quaternion);
      const distance=root.current.position.clone().sub(lastPosition.current).dot(forward);
      if(Math.abs(distance)<2)for(const wheel of wheelPivots.current)wheel.rotateX(distance/.35);
    }
    lastPosition.current=root.current.position.clone();
  });
  return (
    <group ref={root}>
      <group ref={visual}>
        <primitive object={model} />
      </group>
      <group ref={muzzleFlash} visible={false}><mesh><sphereGeometry args={[.28,8,6]}/><meshBasicMaterial color="#ffe8a6" toneMapped={false}/></mesh><pointLight color="#ffac49" intensity={18} distance={8}/></group>
      <group ref={impactFlash} visible={false}><mesh><sphereGeometry args={[.30,10,8]}/><meshBasicMaterial color="#ff9c38" transparent opacity={.55} depthWrite={false}/></mesh></group>
      {children}
    </group>
  );
});
export default Tank;
