import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, type ShaderMaterial } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { UI_THEMES } from "../../theme/catalog";
import "./previewLoadingSeal.css";

const vertex = /* glsl */ `
  varying vec2 point;
  varying vec3 surface;
  void main() {
    point = uv * 2.0 - 1.0;
    surface = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 accent;
  uniform vec3 secondary;
  uniform float time;
  varying vec2 point;
  varying vec3 surface;

  float chamfer(vec2 p, float size) {
    p = abs(p);
    return max(max(p.x, p.y) - size, (p.x + p.y - size * 1.70) * 0.7071);
  }

  void main() {
    float edge = chamfer(point, 0.84);
    float aa = max(fwidth(edge), 0.002);
    float face = 1.0 - smoothstep(-aa, aa, edge);
    if (face < 0.01) discard;

    float brush = sin(point.y * 1450.0 + sin(point.x * 31.0)) * 0.012;
    float bevel = 1.0 - smoothstep(-0.028, -0.008, edge);
    vec3 normal = normalize(vec3(point.x * bevel * 0.5, 1.0, -point.y * bevel * 0.5));
    vec3 eye = normalize(cameraPosition - surface);
    vec3 softbox = normalize(vec3(-0.4, 1.0, 0.35) + eye);
    float reflection = pow(max(dot(normal, softbox), 0.0), 38.0);
    float satin = 0.18 + 0.12 * abs(sin(point.y * 2.8 + point.x * 0.7));
    vec3 steel = vec3(satin + brush + reflection * 0.28);
    steel *= 1.0 - bevel * 0.46;

    // Stationary machined plate, with light moving along two inset rails.
    float inset = abs(chamfer(point, 0.76));
    float rail = 1.0 - smoothstep(0.007, 0.007 + aa, inset);
    float sweep = pow(max(0.0, cos(point.x * 3.8 + point.y * 2.3 - time * 1.2)), 12.0);
    vec3 trim = mix(accent, secondary, smoothstep(-0.3, 0.3, point.x + point.y));
    vec3 color = mix(steel, trim * (0.45 + sweep * 0.45), rail * 0.86);

    vec2 slots = abs(point);
    float engraving = (1.0 - smoothstep(0.003, 0.006, abs(slots.y - 0.55)))
      * (1.0 - smoothstep(0.52, 0.60, slots.x));
    color *= 1.0 - engraving * 0.65;
    float mark = abs(point.x) + abs(point.y * 1.65);
    float badge = 1.0 - smoothstep(0.012, 0.018, abs(mark - 0.18));
    color = mix(color, trim * 0.55, badge * 0.6);
    gl_FragColor = vec4(color, face * 0.94);
    #include <colorspace_fragment>
  }
`;

export function PreviewLoadingStatus({ label }: { label: string }) {
  return <Html center position={[0, .56, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
    <div className="preview-loading-seal" role="status">{label}</div>
  </Html>;
}

export function PreviewLoadingSeal({ label }: { label: string }) {
  const accent = usePreferencesStore(s => UI_THEMES[s.theme].accent);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const systemReducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uniforms = useMemo(() => {
    const primary = new Color(accent);
    const hsl = primary.getHSL({ h: 0, s: 0, l: 0 });
    const secondary = new Color().setHSL((hsl.h + .5) % 1, Math.min(.65, hsl.s), .42);
    return { accent: { value: primary }, secondary: { value: secondary }, time: { value: 0 } };
  }, [accent]);
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.time.value = reducedMotion || systemReducedMotion ? 0 : clock.elapsedTime;
  });
  return <>
    <mesh name="garage-loading-platform" position={[0, .014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[4, 4]} />
      <shaderMaterial ref={material} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <PreviewLoadingStatus label={label} />
  </>;
}
