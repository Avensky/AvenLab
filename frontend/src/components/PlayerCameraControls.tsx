import {useCombatStore} from "../combat/combatStore";
import {useUIStore} from "../store/menus/uiStore";
import {bindCameraDrag,canUseDrivingCamera} from "../utils/cameraDrag";
import {useNetworkStore} from "../store/session/networkStore";
import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils } from "three";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { VehicleCameraFollower } from "../utils/cameraFollow";

type PlayerCameraControlsProps = {
  playerId: string;
  worldAligned?: boolean;
  offset?: [number, number, number];
  targetOffset?: [number, number, number];
  positionSpeed?: number;
  targetSpeed?: number;
  enabled?: boolean;
  lookSensitivity?: number;
  returnSpeed?: number;
  maxYaw?: number;
  maxPitch?: number;
};

export function PlayerCameraControls({
  playerId,
  worldAligned = false,
  offset = [0, 2.2, -5.5],
  targetOffset = [0, 1, 5],
  positionSpeed = 7,
  targetSpeed = 10,
  enabled = true,
  lookSensitivity = 0.004,
  returnSpeed = 3.5,
  maxYaw = Math.PI * 0.65,
  maxPitch = 0.45,
}: PlayerCameraControlsProps) {
  const reducedMotion=usePreferencesStore(s=>s.reducedMotion);
  const recoil=useRef({shot:-1,kick:0});
  const sensitivity = usePreferencesStore((s) => s.cameraSensitivity);
  const { camera, gl } = useThree();
  const { getInterpolated } = useVehiclePhysicsInterpolator(playerId);
  const follower = useRef<VehicleCameraFollower | null>(null);
  if (follower.current === null) follower.current = new VehicleCameraFollower();
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0);
  const looking = useRef(false);

  useEffect(() => {
    follower.current!.reset();
  }, [playerId, enabled, camera]);
  useEffect(() => {
    if (!enabled) return;
    const unbind=bindCameraDrag(gl.domElement,{
      canDrag:()=>enabled&&canUseDrivingCamera(useUIStore.getState(),useCombatStore.getState().scope),
      onActiveChange:active=>{looking.current=active;},
      onDelta:(dx,dy)=>{
        // Preserve precise short drags and the existing faster long-drag curve.
        const yawCurve = MathUtils.clamp(Math.abs(dx) / 30, 0, 1) ** 2;
        const pitchCurve = MathUtils.clamp(Math.abs(dy) / 30, 0, 1) ** 2;
        orbitYaw.current = MathUtils.clamp(
          orbitYaw.current -
            dx *
              sensitivity *
              MathUtils.lerp(
                lookSensitivity * 0.2,
                lookSensitivity * 1.75,
                yawCurve,
              ),
          -maxYaw,
          maxYaw,
        );
        orbitPitch.current = MathUtils.clamp(
          orbitPitch.current -
            dy *
              sensitivity *
              MathUtils.lerp(
                lookSensitivity * 0.2,
                lookSensitivity * 1.35,
                pitchCurve,
              ),
          -maxPitch,
          maxPitch,
        );
      },
    });
    return () => {
      unbind();
      orbitYaw.current = orbitPitch.current = 0;
    };
  }, [enabled, gl, playerId, sensitivity, lookSensitivity, maxYaw, maxPitch]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const pose = getInterpolated(playerId);
    if (!pose) {
      follower.current!.reset();
      return;
    }
    if (!looking.current) {
      const alpha =
        1 - Math.exp(-Math.max(0, returnSpeed) * Math.max(0, delta));
      orbitYaw.current = MathUtils.lerp(orbitYaw.current, 0, alpha);
      orbitPitch.current = MathUtils.lerp(orbitPitch.current, 0, alpha);
    }
    follower.current!.update(
      pose,
      offset,
      targetOffset,
      orbitYaw.current,
      orbitPitch.current,
      positionSpeed,
      targetSpeed,
      delta,
      worldAligned,
    );
    // Copy the shared displayed pose plus local view offsets. No extra world
    // lerp, velocity prediction, wheel compensation or raw-snapshot follow.
    camera.position.copy(follower.current!.position);
    camera.lookAt(follower.current!.target);
    const shell=useNetworkStore.getState().getMe()?.combat?.cannon_shot;
    if(shell!==undefined){if(recoil.current.shot>=0&&shell!==recoil.current.shot)recoil.current.kick=1;recoil.current.shot=shell;}
    recoil.current.kick=Math.max(0,recoil.current.kick-delta*4);
    if(!reducedMotion)camera.rotateX(recoil.current.kick*.035);
  }, -1);
  return null;
}
