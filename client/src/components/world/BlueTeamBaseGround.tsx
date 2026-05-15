import { useMemo } from "react";
import * as THREE from "three";

function createAsphaltTexture() {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);

  for (let i = 0; i < image.data.length; i += 4) {
    const noise = 35 + Math.random() * 35;

    image.data[i] = noise;
    image.data[i + 1] = noise;
    image.data[i + 2] = noise;
    image.data[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(32, 32);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

export function BlueTeamBaseGround() {
  const asphaltTexture = useMemo(() => createAsphaltTexture(), []);

  return (
    <group name="blue-team-base-ground">
      <mesh
        name="blue-team-asphalt-plane"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[400, 600]} />
        <meshStandardMaterial
          map={asphaltTexture}
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>

      {/* <mesh
        name="blue-team-spawn-pad"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.015, 0]}
        receiveShadow
      >
        <planeGeometry args={[28, 40]} />
        <meshStandardMaterial
          color="#202426"
          roughness={1.0}
          metalness={0.0}
        />
      </mesh> */}

      <mesh
        name="ocean-plane"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.35, 0]}
      >
        <planeGeometry args={[700, 900]} />
        <meshStandardMaterial
          color="#12384a"
          roughness={0.55}
          metalness={0.0}
        />
      </mesh>
    </group>
  );
}