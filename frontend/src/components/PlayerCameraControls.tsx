import { usePreferencesStore } from "../store/preferencesStore";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils } from "three";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { VehicleCameraFollower } from "../utils/cameraFollow";

type PlayerCameraControlsProps = {
  playerId: string;
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
  playerId, offset = [0, 2.2, -5.5], targetOffset = [0, 1, 5],
  positionSpeed = 7, targetSpeed = 10, enabled = true,
  lookSensitivity = 0.004, returnSpeed = 3.5,
  maxYaw = Math.PI * 0.65, maxPitch = 0.45,
}: PlayerCameraControlsProps) {
  const sensitivity = usePreferencesStore((s) => s.cameraSensitivity);
  const { camera, gl } = useThree();
  const { getInterpolated } = useVehiclePhysicsInterpolator(playerId);
  const follower = useRef<VehicleCameraFollower | null>(null);
  if (follower.current === null) follower.current = new VehicleCameraFollower();
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0);
  const looking = useRef(false);
  const activePointer = useRef<number | null>(null);
  const previousPointer = useRef({ x: 0, y: 0 });

  useEffect(() => { follower.current!.reset(); }, [playerId, enabled, camera]);
  useEffect(() => {
    if (!enabled) return;
    const element = gl.domElement;
    const releasePointer = () => {
      const pointer = activePointer.current;
      looking.current = false;
      activePointer.current = null;
      if (pointer !== null && element.hasPointerCapture?.(pointer)) element.releasePointerCapture(pointer);
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 2) return;
      if (activePointer.current !== null) return;
      looking.current = true;
      activePointer.current = event.pointerId;
      previousPointer.current = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!looking.current || activePointer.current !== event.pointerId) return;
      const dx = event.clientX - previousPointer.current.x;
      const dy = event.clientY - previousPointer.current.y;
      previousPointer.current = { x: event.clientX, y: event.clientY };
      // Preserve precise short drags and the existing faster long-drag curve.
      const yawCurve = MathUtils.clamp(Math.abs(dx) / 30, 0, 1) ** 2;
      const pitchCurve = MathUtils.clamp(Math.abs(dy) / 30, 0, 1) ** 2;
      orbitYaw.current = MathUtils.clamp(orbitYaw.current - dx * sensitivity * MathUtils.lerp(lookSensitivity * 0.2, lookSensitivity * 1.75, yawCurve), -maxYaw, maxYaw);
      orbitPitch.current = MathUtils.clamp(orbitPitch.current - dy * sensitivity * MathUtils.lerp(lookSensitivity * 0.2, lookSensitivity * 1.35, pitchCurve), -maxPitch, maxPitch);
    };
    const onUp = (event: PointerEvent) => { if (activePointer.current === event.pointerId) releasePointer(); };
    const onLostCapture = () => { looking.current = false; activePointer.current = null; };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    element.addEventListener("lostpointercapture", onLostCapture);
    element.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", releasePointer);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      element.removeEventListener("lostpointercapture", onLostCapture);
      element.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", releasePointer);
      releasePointer(); orbitYaw.current = orbitPitch.current = 0;
    };
  }, [enabled, gl, playerId, sensitivity, lookSensitivity, maxYaw, maxPitch]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const pose = getInterpolated(playerId);
    if (!pose) { follower.current!.reset(); return; }
    if (!looking.current) {
      const alpha = 1 - Math.exp(-Math.max(0, returnSpeed) * Math.max(0, delta));
      orbitYaw.current = MathUtils.lerp(orbitYaw.current, 0, alpha);
      orbitPitch.current = MathUtils.lerp(orbitPitch.current, 0, alpha);
    }
    follower.current!.update(pose, offset, targetOffset, orbitYaw.current, orbitPitch.current, positionSpeed, targetSpeed, delta);
    // Copy the shared displayed pose plus local view offsets. No extra world
    // lerp, velocity prediction, wheel compensation or raw-snapshot follow.
    camera.position.copy(follower.current!.position);
    camera.lookAt(follower.current!.target);
  }, -1);
  return null;
}
