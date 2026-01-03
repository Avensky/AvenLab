import { PerspectiveCamera, OrthographicCamera, OrbitControls } from '@react-three/drei'
import { useStore } from '../store'
import { RotatingCamera } from './RotatingCamera'
import { useEffect, useRef } from 'react';
import { OrbitControls as ThreeOrbitControls } from 'three-stdlib';

export default function Cameras() {
  const screen = useStore((state) => state.screen);
  const camMode = useStore((state) => state.camera);
  const editor = useStore((state) => state.booleans.editor);
  const controlsRef = useRef<ThreeOrbitControls | null>(null);
  // console.log('cameras', camMode)

  // Cleanup function
  useEffect(() => {
    return () => {
      if (controlsRef.current) {
        console.log('[OrbitControls] Disposing');
        controlsRef.current.dispose?.();
      }
    };
  }, []); // ✅ only run once

  if (editor) {
    return (
      <OrthographicCamera makeDefault position={[0, 50, 0]} zoom={20} />
    );
  }
  if (camMode === 'BIRDS_EYE') {
    return <PerspectiveCamera makeDefault fov={75} position={[0, 1, 0]} />
  }
  return (
    <>
      <PerspectiveCamera makeDefault fov={75} position={[0, 7, 12]} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={camMode === 'GALLERY' && screen === 'selection-screen'}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={0}
        enableZoom
        minDistance={3}
        maxDistance={13}
      />
      {camMode === 'GALLERY' && screen === 'selection-screen' && (
        <RotatingCamera
          orbitRef={controlsRef}
          radius={4.5}
          speed={0.2}
          height={2.2}
          resumeDuration={5}
        />
      )}
    </>
  );
}
