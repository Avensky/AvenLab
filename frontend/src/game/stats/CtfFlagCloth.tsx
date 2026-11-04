import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { DoubleSide, Vector3, type Group, type PlaneGeometry } from 'three';
import { usePreferencesStore } from '../../store/preferences/preferencesStore';
import { approachFlagClothYaw, flagClothTargetYaw, FLAG_CLOTH_HEIGHT, FLAG_CLOTH_WIDTH, updateFlagCloth } from './flagClothMotion';

/** Only the cloth hinges. Its attached edge stays at the pole while the free
 * edge waves; a limited camera-aware swivel avoids an unreadable edge-on line. */
export function CtfFlagCloth({ color, carried = false }: { color: string; carried?: boolean }) {
  const pivot = useRef<Group>(null), geometry = useRef<PlaneGeometry>(null);
  const initialized = useRef(false), cameraLocal = useMemo(() => new Vector3(), []);
  const reduced = usePreferencesStore(state => state.reducedMotion);
  useFrame(({ clock, camera }, delta) => {
    if (geometry.current) updateFlagCloth(geometry.current, reduced ? 0 : clock.elapsedTime);
    const group = pivot.current, parent = group?.parent;
    if (!carried || !group || !parent) return;
    // The carrier's -2 frame callback already applied the shared chassis pose.
    parent.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraLocal);
    parent.worldToLocal(cameraLocal);
    const target = flagClothTargetYaw(group.rotation.y, cameraLocal.x, cameraLocal.z);
    group.rotation.y = !initialized.current || reduced ? target : approachFlagClothYaw(group.rotation.y, target, delta);
    initialized.current = true;
  }, -1);
  return <group ref={pivot} name="flag-cloth-pivot" position={[0, 1.9, 0]}>
    <mesh name="flag-cloth" position={[FLAG_CLOTH_WIDTH / 2, 0, 0]} frustumCulled={false}>
      <planeGeometry ref={geometry} args={[FLAG_CLOTH_WIDTH, FLAG_CLOTH_HEIGHT, 10, 3]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={.25} roughness={.95} side={DoubleSide} />
    </mesh>
  </group>;
}
