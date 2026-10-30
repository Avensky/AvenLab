import { useLayoutStore } from "../state/layoutStore";
/** Markers are editor visuals. They never become collision bodies. +Z is zero yaw. */
export function SpawnMarkers() {
  const spawns = useLayoutStore((s) => s.doc?.spawns),
    selected = useLayoutStore((s) => s.selectedSpawn);
  return (
    <group name="vehicle-spawn-markers">
      {spawns?.map((point) => {
        const color = point.team === "red" ? "#ff687d" : "#78b3ff";
        return (
          <group
            key={point.id}
            position={[
              point.position[0],
              point.position[1] + 0.08,
              point.position[2],
            ]}
            rotation={[0, (point.yaw * Math.PI) / 180, 0]}
            onClick={(e) => {
              if (e.button === 0 && e.delta < 5) {
                e.stopPropagation();
                useLayoutStore.getState().selectSpawn(point.id);
              }
            }}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
              <ringGeometry args={[selected === point.id ? 2.6 : 2.8, 3, 24]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
            <mesh position={[0, 0, 1.3]} renderOrder={11}>
              <boxGeometry args={[0.3, 0.1, 2.6]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
            <mesh
              position={[0, 0, 3.2]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={11}
            >
              <coneGeometry args={[0.85, 1.5, 3]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
