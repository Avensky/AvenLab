import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, MathUtils, Quaternion, Vector3 } from 'three';
import { useVehiclePhysicsInterpolator } from '../../hooks/usePhysicsInterpolator';
import { DEFAULT_DRIVER, useVehicleEditorStore } from './vehicleEditorStore';
/** Camera-only animation follows the same displayed pose as the vehicle. */
export function VehicleCameraRig({ playerId, vehicleId, enabled, reducedMotion, showMarker = false }: {
    playerId: string;
    vehicleId: string;
    enabled: boolean;
    reducedMotion: boolean;
    showMarker?: boolean;
}) {
    const profile = useVehicleEditorStore(s => s.cameras[vehicleId]) ?? DEFAULT_DRIVER;
    const view = useVehicleEditorStore(s => s.view);
    const replay = useVehicleEditorStore(s => s.replay);
    const { camera } = useThree();
    const { getInterpolated } = useVehiclePhysicsInterpolator(playerId);
    const elapsed = useRef(0);
    const marker = useRef<Group>(null);
    const vectors = useMemo(() => ({ p: new Vector3(), target: new Vector3(), local: new Vector3(), q: new Quaternion(), eye: new Vector3(), direction: new Vector3(), waypoint: new Vector3(), look: new Vector3() }), []);
    useEffect(() => { elapsed.current = 0; }, [replay, playerId, enabled]);
    useFrame((_, delta) => {
        if (!enabled && !showMarker)
            return;
        const pose = getInterpolated(playerId);
        if (!pose)
            return;
        elapsed.current += Math.min(delta, .1);
        const { p, target, local, q, eye, direction, waypoint, look } = vectors;
        q.fromArray(pose.rotation);
        p.fromArray(pose.position);
        eye.set(profile.x, profile.y, profile.z);
        if (marker.current) {
            marker.current.position.copy(eye).applyQuaternion(q).add(p);
            marker.current.quaternion.copy(q);
        }
        if (!enabled)
            return;
        const yaw = MathUtils.degToRad(profile.yaw), pitch = MathUtils.degToRad(profile.pitch);
        direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        if (view === 'bird') {
            local.set(0, 36, -.1);
            target.copy(p);
        }
        else if (view === 'approach') {
            const t = reducedMotion ? 1 : Math.min(1, elapsed.current / Math.max(1, profile.duration));
            const smooth = (v: number) => v * v * (3 - 2 * v);
            // Descend outside the driver's side before entering at eye height.
            // This avoids the straight through-the-roof path of a simple lerp.
            if (t < .65)
                local.set(-10, 30, -14).lerp(waypoint.set(-3, profile.y + .5, profile.z), smooth(t / .65));
            else
                local.set(-3, profile.y + .5, profile.z).lerp(eye, smooth((t - .65) / .35));
            look.copy(eye).addScaledVector(direction, 8);
            target.copy(look).applyQuaternion(q).add(p);
        }
        else {
            local.copy(eye);
            target.copy(eye).addScaledVector(direction, 20).applyQuaternion(q).add(p);
        }
        camera.position.copy(local.applyQuaternion(q).add(p));
        camera.lookAt(target);
    }, -.5);
    return showMarker ? <group ref={marker} name="driver-eye-marker">
    <mesh><sphereGeometry args={[.07, 12, 8]}/><meshBasicMaterial color="#ffbc65" depthTest={false}/></mesh>
    <mesh position={[0, 0, .25]}><boxGeometry args={[.015, .015, .5]}/><meshBasicMaterial color="#ffbc65" depthTest={false}/></mesh>
  </group> : null;
}
