import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Fog, type Points } from "three";
import { skyReflectionMap, worldSkyLighting } from "./worldSkyLighting";
import type { WorldSkyPreset } from "../store/world/worldStore";

// A fixed celestial sphere gives every client the same stars, including late joins.
const positions = new Float32Array(1200 * 3);
const colors = new Float32Array(positions.length);
let seed = 0x4156454e;
function sample() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
for (let i = 0; i < positions.length; i += 3) {
  const y = sample(), azimuth = sample() * Math.PI * 2;
  const ring = Math.sqrt(1 - y * y), brightness = .22 + .76 * sample() ** 2;
  positions.set([700 * ring * Math.cos(azimuth), 700 * y, 700 * ring * Math.sin(azimuth)], i);
  colors.set([brightness * .82, brightness * .9, brightness], i);
}

const ignoreStarHits = () => {};

function NightStars() {
  const points = useRef<Points>(null);
  useFrame(({ camera }) => points.current?.position.copy(camera.position));
  return <points ref={points} name="world-stars" raycast={ignoreStarHits} frustumCulled={false} renderOrder={-100}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      <bufferAttribute attach="attributes-color" args={[colors, 3]} />
    </bufferGeometry>
    <pointsMaterial vertexColors size={1.25} sizeAttenuation={false} fog={false} depthWrite={false} toneMapped={false} />
  </points>;
}

export function WorldAtmosphere({ preset, shadows, detailedReflections }: { preset: WorldSkyPreset; shadows: boolean; detailedReflections: boolean }) {
  const scene = useThree(s => s.scene), gl = useThree(s => s.gl), invalidate = useThree(s => s.invalidate);
  const sky = worldSkyLighting(preset);
  const day = preset === "foggy_day";
  useLayoutEffect(() => {
    const background = scene.background, fog = scene.fog;
    const exposure = gl.toneMappingExposure;
    scene.background = new Color(sky.horizon);
    scene.fog = new Fog(sky.horizon, sky.fogNear, sky.fogFar);
    gl.toneMappingExposure = 1;
    invalidate();
    return () => { scene.background = background; scene.fog = fog; gl.toneMappingExposure = exposure; invalidate(); };
  }, [scene, gl, invalidate, sky]);
  useLayoutEffect(() => {
    const previous = scene.environment, intensity = scene.environmentIntensity, rotation = scene.environmentRotation.clone();
    const texture = skyReflectionMap(preset, detailedReflections);
    scene.environment = texture;
    scene.environmentIntensity = 1;
    scene.environmentRotation.set(0, 0, 0);
    invalidate();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = intensity;
      scene.environmentRotation.copy(rotation);
      texture.dispose();
      invalidate();
    };
  }, [scene, invalidate, preset, detailedReflections]);
  return <>
    {!day && <NightStars />}
    <hemisphereLight args={[sky.skyLight, sky.groundLight, sky.ambient]} />
    <directionalLight color={sky.keyColor} intensity={sky.keyIntensity}
      position={[-120, 180, -80]} castShadow={shadows} />
  </>;
}
