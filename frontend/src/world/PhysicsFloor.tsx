import { useWorldStore } from "../store";

// Optional flat-road reference only. This Three.js mesh creates no collider.
// It follows backend metadata, so Y=0 is never mistaken for the road surface.
export function PhysicsFloor() {
  const map = useWorldStore((state) => state.map);
  if (!map) return null;
  const thickness = 0.02;
  const [width, depth] = map.cell;
  const roadY = map.surface.road_y;

  return (
    <group name="physics-floor-reference">
      {map.chunks.map((chunk) => (
        <group key={`${chunk.x},${chunk.z}`} position={chunk.origin}>
          {/* Box center sits half its thickness below the backend surface. */}
          <mesh position={[0, roadY - thickness / 2, 0]}>
            <boxGeometry args={[width, thickness, depth]} />
            <meshBasicMaterial
              color="#00ffff"
              transparent
              opacity={0.18}
              depthWrite={false}
            />
          </mesh>
          <axesHelper args={[2]} position={[0, roadY, 0]} />
        </group>
      ))}
    </group>
  );
}
