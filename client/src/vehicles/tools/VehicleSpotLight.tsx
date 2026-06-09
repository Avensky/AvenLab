import { useMemo } from "react";
import type { RefObject } from "react";
import { Object3D, SpotLight } from "three";

type VehicleSpotLightProps = {
  lightRef: RefObject<SpotLight | null>;
  color: number;
  intensity: number;
  distance: number;
  position: [number, number, number];
  target: [number, number, number];
};

export function VehicleSpotLight({ lightRef, color, intensity, distance, position, target }: VehicleSpotLightProps) {
  const targetObject = useMemo(() => {
    const obj = new Object3D();
    obj.position.set(...target);
    return obj;
  }, [target]);

  return (<>
    <spotLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      distance={distance}
      angle={Math.PI / 6}
      penumbra={0.2}
      position={position}
      target={targetObject}
      visible={false}
    />
    <primitive object={targetObject} />
  </>
  );
}