import { useLayoutEffect, useRef } from "react";
import {
  Color,
  InstancedMesh,
  Object3D,
  type MeshStandardMaterial,
} from "three";
import type { DebugAabbBox } from "../store/session/networkStore";

// A cheap distant skyline, not physics: the server's original colliders remain
// authoritative. One box batch adds window bands without textures or downloads.
export function CityProxy({
  boxes,
  shadows = false,
}: {
  boxes: DebugAabbBox[];
  shadows?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new Object3D(),
      color = new Color();
    boxes.forEach((box, i) => {
      let hash = 0;
      for (const char of box.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
      const shade = Math.abs(hash) % 3;
      transform.position.fromArray(box.center);
      transform.scale.set(
        ...(box.half_extents.map((value) => Math.max(0.01, value * 2)) as [
          number,
          number,
          number,
        ]),
      );
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(
        i,
        color.set(
          box.kind !== "building"
            ? "#1b222b"
            : shade === 0
              ? "#273447"
              : shade === 1
                ? "#34404c"
                : "#202b38",
        ),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  if (!boxes.length) return null;
  return (
    <instancedMesh
      name="city-distant-skyline"
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      <boxGeometry />
      <meshStandardMaterial
        roughness={0.85}
        metalness={0.05}
        onBeforeCompile={proxyWindows}
      />
    </instancedMesh>
  );
}
const proxyWindows: MeshStandardMaterial["onBeforeCompile"] = (shader) => {
  shader.vertexShader =
    `varying vec3 vCityWorld; varying vec3 vCityFace;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvec4 cityPoint = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ncityPoint = instanceMatrix * cityPoint;\n#endif\nvCityWorld = (modelMatrix * cityPoint).xyz; vCityFace = abs(normal);`,
    );
  shader.fragmentShader =
    `varying vec3 vCityWorld; varying vec3 vCityFace;\n${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
     float axis = mix(vCityWorld.x, vCityWorld.z, step(vCityFace.z, vCityFace.x));
     vec2 cell = vec2(axis / 3.8, vCityWorld.y / 3.4);
     vec2 edge = abs(fract(cell) - 0.5);
     vec2 aa = max(fwidth(cell), vec2(0.001));
     vec2 panes = 1.0 - smoothstep(vec2(0.27) - aa, vec2(0.27) + aa, edge);
     float windows = panes.x * panes.y * (1.0 - step(0.5, vCityFace.y));
     float lit = step(0.62, fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453));
     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.04, 0.065), windows * 0.65);
     totalEmissiveRadiance += vec3(0.10, 0.12, 0.16) * windows * lit;`,
    );
};
