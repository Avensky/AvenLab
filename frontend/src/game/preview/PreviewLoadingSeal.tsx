import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, type ShaderMaterial } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { UI_THEMES } from "../../theme/catalog";
import "./previewLoadingSeal.css";

const vertex = /* glsl */ `
  varying vec2 point;
  void main() {
    point = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 accent;
  uniform float time;
  varying vec2 point;

  float ring(float radius, float at, float width) {
    float edge = max(fwidth(radius), 0.002);
    return 1.0 - smoothstep(width, width + edge, abs(radius - at));
  }

  void main() {
    float radius = length(point);
    float angle = atan(point.y, point.x + 0.00001);
    float sectors = smoothstep(-0.3, 0.15, cos(angle * 12.0 + time * 1.8));
    float wave = 0.47 + 0.35 * sin(time * 1.8);
    float ink = ring(radius, 0.87, 0.009) + ring(radius, 0.79, 0.01) * sectors;
    ink += ring(radius, 0.64, 0.005) * 0.52 + ring(radius, wave, 0.009) * 0.26;
    ink += (1.0 - smoothstep(0.045, 0.065, abs(point.x) + abs(point.y))) * 0.74;
    float glow = 0.10 * exp(-18.0 * abs(radius - 0.84)) + 0.055 * (1.0 - smoothstep(0.0, 0.87, radius));
    gl_FragColor = vec4(accent, min(0.74, ink * 0.65 + glow));
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
  const uniforms = useMemo(() => ({ accent: { value: new Color(accent) }, time: { value: 0 } }), [accent]);
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.time.value = reducedMotion || systemReducedMotion ? 0 : clock.elapsedTime;
  });
  return <>
    <mesh name="garage-floor-summon-circle" position={[0, .014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[4, 4]} />
      <shaderMaterial ref={material} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <PreviewLoadingStatus label={label} />
  </>;
}
