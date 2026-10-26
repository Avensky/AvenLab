import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { LinearMipmapLinearFilter, PlaneGeometry, ShaderMaterial, UniformsLib, Vector2, Vector4, type Box3, type Group } from "three";
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
    perimeterBounds: { value: new Vector4() }, showPerimeter: { value: 0 },
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
    uniform vec4 perimeterBounds;
    uniform float showPerimeter;
    varying vec4 vReflection;
    varying vec2 vFloor;
    #include <common>
    #include <fog_pars_fragment>
    float blurWeight(int offset) {
      return offset == 0 ? 0.375 : (abs(offset) == 1 ? 0.25 : 0.0625);
    }
    void main() {
      vec2 uv = vReflection.xy / vReflection.w;
      float c = cos(platformAngle), s = sin(platformAngle);
      vec2 local = vec2(c * vFloor.x - s * vFloor.y, s * vFloor.x + c * vFloor.y);
      vec2 edge = abs(local) - platformHalfSize;
      float edgeValue = max(edge.x, edge.y);
      float edgeAA = max(fwidth(edgeValue), 0.015);
      float platform = 1.0 - smoothstep(-edgeAA, edgeAA, edgeValue);
      vec3 reflection = texture2D(tDiffuse, uv).rgb;
      if (platform > 0.001) {
        // Adjacent texels give one continuous blur instead of widely spaced
        // copies of bright fixtures that sparkle as the platform turns.
        vec2 d = reflectionTexel;
        vec3 soft = vec3(0.0);
        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            soft += texture2D(tDiffuse, uv + vec2(float(x), float(y)) * d).rgb * blurWeight(x) * blurWeight(y);
          }
        }
        // Keep the pad mainly reflective, with just a little softened detail.
        reflection = mix(reflection, soft, platform * 0.25);
      }
      // Equal world units on X/Z produce square tiles at every aspect ratio.
      vec2 tile = vFloor / 0.4;
      vec2 grid = abs(fract(tile + 0.5) - 0.5);
      vec2 aa = max(fwidth(tile), vec2(0.0001));
      vec2 lines = smoothstep(vec2(0.491) - aa, vec2(0.491) + aa, grid);
      float grout = max(lines.x, lines.y);
      // A charcoal base keeps the same tiles readable under dark walls and
      // bright pillars; reflected light should not look like a different floor.
      vec3 tileColor = vec3(0.018, 0.019, 0.021) + reflection * 0.5;
      tileColor = mix(tileColor, vec3(0.0005), grout * 0.98);
      vec2 wallDistance = min(vFloor - perimeterBounds.xy, perimeterBounds.zw - vFloor);
      float wallEdge = min(wallDistance.x, wallDistance.y);
      float trimAA = max(fwidth(wallEdge), 0.005);
      float trim = showPerimeter * smoothstep(-trimAA, trimAA, wallEdge)
        * (1.0 - smoothstep(0.55 - trimAA, 0.55 + trimAA, wallEdge));
      tileColor = mix(tileColor, vec3(0.085, 0.09, 0.10) + reflection * 0.28, trim);
      vec3 padColor = vec3(0.005, 0.005, 0.006) + reflection * 0.75;
      // Complete safety band on all four edges, in the platform's coordinates.
      float edgeDistance = min(platformHalfSize.x - abs(local.x), platformHalfSize.y - abs(local.y));
      float bandAA = max(fwidth(edgeDistance), 0.0075);
      float safetyBand = 1.0 - smoothstep(0.1375 - bandAA, 0.1375 + bandAA, edgeDistance);
      float stripePosition = (local.x + local.y) / 0.28;
      float stripeAA = max(fwidth(stripePosition) * 2.0, 0.001);
      float stripe = smoothstep(0.5 - stripeAA, 0.5 + stripeAA, abs(fract(stripePosition) * 2.0 - 1.0));
      vec3 safetyColor = mix(vec3(0.0015), vec3(0.8, 0.2094, 0.0), stripe);
      padColor = mix(padColor, safetyColor, safetyBand);
      gl_FragColor = vec4(mix(tileColor, padColor, platform), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `,
};

export function GarageFloorReflection({ width, depth, turntable, perimeter }: { width: number; depth: number; turntable: Group | null; perimeter: Box3 | null }) {
  const floorRef = useRef<Reflector>(null);
  const floor = useMemo(() => {
    // Continue the floor past the model's cropped edge so it fills the screen.
    const object = new Reflector(new PlaneGeometry(200, 200), {
      // A positive clip bias admitted the opaque pad below the mirror into the
      // capture, hiding the vehicle/ceiling behind its underside. The mirror is
      // already raised 3mm; clip exactly there to keep that underlay excluded.
      shader: floorShader, textureWidth: 768, textureHeight: 768, multisample: 0, clipBias: 0,
    });
    object.name = "garage-floor-reflection";
    object.rotation.x = -Math.PI / 2;
    object.position.y = 0.003;
    const material = object.material as ShaderMaterial;
    material.fog = true;
    // Keep the overlay ahead of the source pad's nearly coplanar triangles.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    // Filter small reflected lights at grazing angles, rather than letting
    // single subpixel highlights flash between full brightness and black.
    const texture = object.getRenderTarget().texture;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    material.uniforms.platformHalfSize.value.set(width / 2, depth / 2);
    if (perimeter && !perimeter.isEmpty()) {
      material.uniforms.perimeterBounds.value.set(perimeter.min.x, perimeter.min.z, perimeter.max.x, perimeter.max.z);
      material.uniforms.showPerimeter.value = 1;
    }
    return object;
  }, [width, depth, perimeter]);
  useFrame(() => {
    const material = floorRef.current?.material as ShaderMaterial | undefined;
    if (material) material.uniforms.platformAngle.value = turntable?.rotation.y ?? 0;
  });
  useEffect(() => () => { floor.dispose(); floor.geometry.dispose(); }, [floor]);
  return <primitive ref={floorRef} object={floor} dispose={null} />;
}
