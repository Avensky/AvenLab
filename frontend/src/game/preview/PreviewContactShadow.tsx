import { useEffect, useMemo } from "react";
import { DataTexture, LinearFilter } from "three";

// Small display-only contact cue. One draw call, no network or shadow-map pass.
export function PreviewContactShadow({ footprint, offset = [0, 0] }: { footprint: [number, number]; offset?: readonly [number, number] }) {
  const texture = useMemo(() => {
    const side = 32, pixels = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const radius = ((x + 0.5) / side * 2 - 1) ** 2 + ((y + 0.5) / side * 2 - 1) ** 2;
      pixels[(y * side + x) * 4 + 3] = Math.round(Math.max(0, 1 - radius) ** 1.3 * 150);
    }
    const result = new DataTexture(pixels, side, side);
    result.magFilter = LinearFilter; result.minFilter = LinearFilter; result.needsUpdate = true;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh name="preview-contact-shadow" rotation={[-Math.PI / 2, 0, 0]} position={[offset[0], 0.006, offset[1]]}>
    <planeGeometry args={[footprint[0] * 1.5, footprint[1] * 1.25]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
  </mesh>;
}
