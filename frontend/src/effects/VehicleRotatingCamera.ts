import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

type Props = {
  radius?: number;
  height?: number;
  speed?: number;
  target?: THREE.Vector3;
};

export function VehicleRotatingCamera({
  radius = 7,
  height = 2.4,
  speed = 0.35,
  target = new THREE.Vector3(0, 0.6, 0),
}: Props) {
  const { camera } = useThree();
  const angleRef = useRef(0);

  useFrame((_, delta) => {
    angleRef.current += speed * delta;

    const x = Math.sin(angleRef.current) * radius;
    const z = Math.cos(angleRef.current) * radius;

    camera.position.lerp(
      new THREE.Vector3(x, height, z),
      0.035
    );

    camera.lookAt(target);
  });

  return null;
}