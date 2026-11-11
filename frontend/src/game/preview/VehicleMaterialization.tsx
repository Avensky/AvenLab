import { useMemo, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { UI_THEMES } from "../../theme/catalog";

const circleVertex = /* glsl */ `
  varying vec2 glyph;
  void main() {
    glyph = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const circleFragment = /* glsl */ `
  uniform float progress;
  uniform vec3 accent;
  varying vec2 glyph;

  float band(float radius, float center) {
    return 1.0 - smoothstep(0.008, 0.023, abs(radius - center));
  }

  void main() {
    float radius = length(glyph);
    float angle = atan(glyph.y, glyph.x) + progress * 0.9;
    float fade = smoothstep(0.0, 0.18, progress) * (1.0 - smoothstep(0.60, 1.0, progress));
    float ticks = smoothstep(0.73, 0.93, cos(angle * 18.0));
    float glyphs = ticks * smoothstep(0.74, 0.76, radius) * (1.0 - smoothstep(0.82, 0.84, radius));
    float pulse = band(radius, mix(0.38, 0.97, progress)) * 0.62;
    float lines = band(radius, 0.88) + 0.65 * band(radius, 0.70) + glyphs + pulse;
    gl_FragColor = vec4(mix(accent, vec3(1.0), 0.45), min(1.0, lines) * fade);
  }
`;

const sparkVertex = /* glsl */ `
  uniform float progress;
  uniform float pixelRatio;
  uniform vec2 radius;
  varying float glow;

  void main() {
    float age = clamp((progress - position.y * 0.35) / 0.65, 0.0, 1.0);
    float angle = position.x * 6.2831853 + age * 1.25;
    float drift = mix(1.0, 0.73, age);
    vec3 spark = vec3(cos(angle) * radius.x * drift, age * (0.5 + position.z * 1.9),
                      sin(angle) * radius.y * drift);
    vec4 eye = modelViewMatrix * vec4(spark, 1.0);
    glow = smoothstep(0.0, 0.17, age) * (1.0 - smoothstep(0.48, 1.0, age));
    gl_Position = projectionMatrix * eye;
    gl_PointSize = pixelRatio * clamp(22.0 / max(0.1, -eye.z), 2.0, 6.0);
  }
`;

const sparkFragment = /* glsl */ `
  uniform vec3 accent;
  varying float glow;
  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float core = max(0.0, 1.0 - dot(point, point));
    gl_FragColor = vec4(mix(accent, vec3(1.0), core), core * core * glow);
  }
`;

/** Two small draws around the replacement vehicle, with no lights or textures. */
export function VehicleMaterialization({ progress, footprint, offset }: {
  progress: RefObject<number>;
  footprint: readonly [number, number];
  offset: readonly [number, number];
}) {
  const theme = usePreferencesStore(state => state.theme);
  const width = footprint[0] + 1.15;
  const length = footprint[1] + 1.15;
  const uniforms = useMemo(() => ({
    progress: { value: 0 },
    accent: { value: new Color(UI_THEMES[theme].accent) },
    pixelRatio: { value: 1 },
    radius: { value: [width * .41, length * .41] },
  }), [theme, width, length]);
  const sparks = useMemo(() => Float32Array.from({ length: 144 }, (_, index) =>
    ((Math.floor(index / 3) + 1) * [.61803399, .75487767, .56984029][index % 3]) % 1), []);
  useFrame(({ gl }) => {
    uniforms.progress.value = progress.current;
    uniforms.pixelRatio.value = Math.min(gl.getPixelRatio(), 2);
  }, -.6);
  return <group name="vehicle-materialization" position={[offset[0], .037, offset[1]]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[width, length]} />
      <shaderMaterial vertexShader={circleVertex} fragmentShader={circleFragment} uniforms={uniforms}
        transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[sparks, 3]} /></bufferGeometry>
      <shaderMaterial vertexShader={sparkVertex} fragmentShader={sparkFragment} uniforms={uniforms}
        transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </points>
  </group>;
}
