import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PlaneGeometry, ShaderMaterial, UniformsLib, Vector2, type Group } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

// One shared planar capture avoids recursive floor/platform mirror renders.
// World-space square tiles stay fixed; only the softer platform finish rotates.
const floorShader = {
  name: "GarageBlackTiles",
  uniforms: {
    ...UniformsLib.fog,
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    platformHalfSize: { value: new Vector2() }, platformAngle: { value: 0 },
    reflectionTexel: { value: new Vector2(1 / 768, 1 / 768) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vReflection;
    varying vec2 vFloor;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vReflection = textureMatrix * vec4(position, 1.0);
      vFloor = (modelMatrix * vec4(position, 1.0)).xz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 platformHalfSize;
    uniform float platformAngle;
    uniform vec2 reflectionTexel;
    varying vec4 vReflection;
    varying vec2 vFloor;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      vec2 uv = vReflection.xy / vReflection.w;
      float c = cos(platformAngle), s = sin(platformAngle);
      vec2 local = vec2(c * vFloor.x - s * vFloor.y, s * vFloor.x + c * vFloor.y);
      vec2 edge = abs(local) - platformHalfSize;
      float platform = 1.0 - smoothstep(-0.015, 0.015, max(edge.x, edge.y));
      vec3 reflection = texture2D(tDiffuse, uv).rgb;
      if (platform > 0.001) {
        vec2 d = reflectionTexel * 1.35;
        vec3 soft = reflection * 0.25;
        soft += (texture2D(tDiffuse, uv + vec2(d.x, 0.0)).rgb
               + texture2D(tDiffuse, uv - vec2(d.x, 0.0)).rgb
               + texture2D(tDiffuse, uv + vec2(0.0, d.y)).rgb
               + texture2D(tDiffuse, uv - vec2(0.0, d.y)).rgb) * 0.125;
        soft += (texture2D(tDiffuse, uv + d).rgb + texture2D(tDiffuse, uv - d).rgb
               + texture2D(tDiffuse, uv + vec2(d.x, -d.y)).rgb
               + texture2D(tDiffuse, uv + vec2(-d.x, d.y)).rgb) * 0.0625;
        reflection = mix(reflection, soft, platform);
      }
      // Equal world units on X/Z produce square tiles at every aspect ratio.
      vec2 tile = vFloor / 0.85;
      vec2 grid = abs(fract(tile + 0.5) - 0.5);
      vec2 aa = max(fwidth(tile), vec2(0.0001));
      vec2 lines = smoothstep(vec2(0.491) - aa, vec2(0.491) + aa, grid);
      float grout = max(lines.x, lines.y);
      vec3 tileColor = vec3(0.0035, 0.0035, 0.004) + reflection * 0.48;
      tileColor = mix(tileColor, vec3(0.016, 0.016, 0.018), grout * 0.94);
      vec3 padColor = vec3(0.005, 0.005, 0.006) + reflection * 0.32;
      // Complete safety band on all four edges, in the platform's coordinates.
      float edgeDistance = min(platformHalfSize.x - abs(local.x), platformHalfSize.y - abs(local.y));
      float safetyBand = 1.0 - smoothstep(0.13, 0.145, edgeDistance);
      float stripe = step(0.5, fract((local.x + local.y) / 0.28));
      vec3 safetyColor = mix(vec3(0.0015), vec3(0.8, 0.2094, 0.0), stripe);
      padColor = mix(padColor, safetyColor, safetyBand);
      gl_FragColor = vec4(mix(tileColor, padColor, platform), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `,
};

export function GarageFloorReflection({ width, depth, turntable }: { width: number; depth: number; turntable: Group | null }) {
  const floorRef = useRef<Reflector>(null);
  const floor = useMemo(() => {
    // Continue the floor past the model's cropped edge so it fills the screen.
    const object = new Reflector(new PlaneGeometry(200, 200), {
      shader: floorShader, textureWidth: 768, textureHeight: 768, multisample: 0,
    });
    object.name = "garage-floor-reflection";
    object.rotation.x = -Math.PI / 2;
    object.position.y = 0.003;
    const material = object.material as ShaderMaterial;
    material.fog = true;
    material.uniforms.platformHalfSize.value.set(width / 2, depth / 2);
    return object;
  }, [width, depth]);
  useFrame(() => {
    const material = floorRef.current?.material as ShaderMaterial | undefined;
    if (material) material.uniforms.platformAngle.value = turntable?.rotation.y ?? 0;
  });
  useEffect(() => () => { floor.dispose(); floor.geometry.dispose(); }, [floor]);
  return <primitive ref={floorRef} object={floor} dispose={null} />;
}
