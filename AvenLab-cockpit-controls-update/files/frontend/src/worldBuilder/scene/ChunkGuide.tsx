import { Html } from "@react-three/drei";
import {
  useEditorPalette,
  useEditorPreferences,
} from "../state/editorPreferences";
export function ChunkGuide({ floor }: { floor: number }) {
  const preferences = useEditorPreferences(),
    p = useEditorPalette();
  if (!preferences.chunkGuide) return null;
  return (
    <group name="chunk-authoring-guide">
      <gridHelper
        args={[200, 2, p.accent, p.axis]}
        position={[0, floor - 0.06, 0]}
      />
      {(
        [
          [-100, -100, "NW"],
          [100, -100, "NE"],
          [-100, 100, "SW"],
          [100, 100, "SE"],
        ] as const
      ).map(([x, z, label]) => (
        <Html
          key={label}
          position={[x, floor + 0.1, z]}
          center
          style={{ pointerEvents: "none" }}
        >
          <span className="le-chunk-label">{label} · 100 × 100 m</span>
        </Html>
      ))}
    </group>
  );
}
