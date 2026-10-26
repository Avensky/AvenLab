import { useEffect, useMemo } from "react";
import { PlaneGeometry } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

// A single small reflection target for the display pad. Reflections follow the
// selected vehicle and green rails; this adds no textures to download.
export function GarageFloorReflection({ width, depth }: { width: number; depth: number }) {
  const floor = useMemo(() => {
    const object = new Reflector(new PlaneGeometry(width * 0.96, depth * 0.96), {
      color: 0x6b726d, textureWidth: 512, textureHeight: 512, multisample: 0,
    });
    object.name = "garage-floor-reflection";
    object.rotation.x = -Math.PI / 2;
    object.position.y = 0.002;
    return object;
  }, [width, depth]);
  useEffect(() => () => { floor.dispose(); floor.geometry.dispose(); }, [floor]);
  return <primitive object={floor} dispose={null} />;
}
