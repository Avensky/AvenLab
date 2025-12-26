// DebugLoadBarVisualizer.tsx
import * as THREE from "three";
import { useRef } from "react";
type LoadBar = {
  origin: [number, number, number];
  length: number;
  color: [number, number, number];
};

export function DebugLoadBarVisualizer({
  bars,
  radius = 0.05,
}: {
  bars: LoadBar[];
  radius?: number;
}) {
  const smoothed = useRef<Record<string, number>>({});

  return (
    <>
      {bars.map((b, i) => {
        // const height = Math.max(b.length, 0.01);
        const key = `${i}`; // or better: wheel id if you pass it
        const prev = smoothed.current[key] ?? b.length;

        // smoothing factor (0 = frozen, 1 = raw)
        const alpha = 0.18; // try 0.12–0.25
        const smoothLen = prev + (b.length - prev) * alpha;

        smoothed.current[key] = smoothLen;
        const height = Math.max(smoothLen, 0.01);

        // 🔹 slight sideways offset so it doesn’t hide inside spring
        const pos = new THREE.Vector3(...b.origin)
          .add(new THREE.Vector3(0, height * 0.5, 0))
          .add(new THREE.Vector3(0.06, 0, 0));

        const rate = Math.abs(b.length - prev);
        const emissiveBoost = THREE.MathUtils.clamp(rate * 8, 0.3, 1.0);

        return (
          <mesh key={i} position={pos} renderOrder={10}>
            <cylinderGeometry args={[radius, radius, height, 8]} />
            <meshStandardMaterial
              color={new THREE.Color(...b.color)}
              emissive={new THREE.Color(...b.color)}
              emissiveIntensity={0.4 + emissiveBoost * 0.6}
              transparent
              opacity={0.7}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}
