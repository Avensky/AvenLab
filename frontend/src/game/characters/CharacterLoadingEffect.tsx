import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, type ShaderMaterial } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { UI_THEMES } from "../../theme/catalog";

const RAIN = 160;
const SPARKS = 32;
const COUNT = RAIN + SPARKS;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDpr;
  varying float vGlow;
  varying float vRain;

  void main() {
    vec3 seed = position;
    float phase = fract(seed.y + uTime * mix(0.48, 0.88, seed.x));
    float angle = 6.2831853 * seed.x + uTime * 0.75 + phase * 1.1;
    float rain = step(0.0, seed.z);
    float height = 1.86 * (1.0 - phase * phase);
    float radius = (0.28 + 0.18 * phase) * mix(0.85, 1.2, abs(seed.z));
    float light = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.76, 1.0, phase));

    // The same point batch emits short parabolic splashes at floor level.
    if (rain < 0.5) {
      height = 0.02 + phase * (1.0 - phase) * mix(0.32, 1.25, -seed.z);
      radius = 0.37 + phase * mix(0.06, 0.27, -seed.z);
      light *= 0.8 + 0.2 * sin(32.0 * phase);
    }

    vec4 eye = modelViewMatrix * vec4(cos(angle) * radius, height, sin(angle) * radius, 1.0);
    gl_Position = projectionMatrix * eye;
    gl_PointSize = uDpr * clamp(mix(18.0, 27.0, rain) / max(0.1, -eye.z), 2.0, 6.0);
    vRain = rain;
    vGlow = light * mix(0.58, 1.0, abs(seed.z));
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uAccent;
  varying float vGlow;
  varying float vRain;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    vec2 shape = uv * vec2(mix(2.1, 4.8, vRain), 2.0);
    float mask = max(0.0, 1.0 - dot(shape, shape));
    vec3 color = mix(uAccent, vec3(1.0), mask * 0.76);
    gl_FragColor = vec4(color, mask * mask * vGlow * 0.82);
  }
`;

export function CharacterLoadingEffect() {
  const theme = usePreferencesStore(state => state.theme);
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const material = useRef<ShaderMaterial>(null);
  const seeds = useMemo(() => {
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      seeds[i * 3] = (i * .61803398875) % 1;
      seeds[i * 3 + 1] = (i * .75487766625) % 1;
      seeds[i * 3 + 2] = ((i * .56984029099) % 1 || .5) * (i < RAIN ? 1 : -1);
    }
    return seeds;
  }, []);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uAccent: { value: new Color(UI_THEMES[theme].accent) },
  }), [theme]);

  useFrame(({ clock, gl }) => {
    if (!material.current) return;
    material.current.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    material.current.uniforms.uDpr.value = Math.min(gl.getPixelRatio(), 2);
  });

  return <points name="character-loading-rain" frustumCulled={false} raycast={() => null}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[seeds, 3]} />
    </bufferGeometry>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader}
      transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
  </points>;
}
