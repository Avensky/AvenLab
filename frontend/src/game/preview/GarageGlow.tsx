import { useEffect, useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { configureGarageBloom } from "./garagePostprocessing";
import { isCompactPreview } from "./previewBudget";

// Selection only: HDR emission -> bloom -> tone mapping/sRGB. Keep the effect
// at at most one pixel per CSS pixel so phone DPR does not multiply its cost.
export function GarageGlow() {
  const contrast = usePreferencesStore((s) => s.highContrast);
  const settings = usePreferencesStore((s) => s.garageEffects);
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const size = useThree(s => s.size);
  const dpr = useThree(s => s.viewport.dpr);
  const bloomEnabled = !isCompactPreview(size.width) && settings.bloom && settings.bloomStrength > 0 && !contrast;
  const effects = useMemo(() => {
    if (!bloomEnabled) return null;
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    // Give bright fixture cores a soft halo while preserving the dark room.
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.24, 0.15, 1.6);
    const output = new OutputPass();
    composer.addPass(render);
    composer.addPass(bloom);
    composer.addPass(output);
    return { composer, render, bloom, output };
  }, [bloomEnabled, gl, scene, camera]);
  useLayoutEffect(() => {
    if (effects) configureGarageBloom(effects.bloom, settings, contrast);
  }, [effects, settings, contrast]);
  useEffect(() => {
    effects?.composer.setPixelRatio(Math.min(1, dpr));
    effects?.composer.setSize(size.width, size.height);
  }, [effects, size.width, size.height, dpr]);
  useEffect(
    () => () => {
      effects?.render.dispose();
      effects?.bloom.dispose();
      effects?.output.dispose();
      effects?.composer.dispose();
    },
    [effects],
  );
  useFrame((_, delta) => {
    const exposure = gl.toneMappingExposure;
    try {
      gl.toneMappingExposure = exposure * settings.exposure;
      if (effects?.bloom.enabled) effects.composer.render(delta);
      else gl.render(scene, camera);
    } finally {
      gl.toneMappingExposure = exposure;
    }
  }, 1);
  return null;
}
