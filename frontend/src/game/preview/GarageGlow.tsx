import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Selection only: HDR emission -> bloom -> tone mapping/sRGB. Keep the effect
// at at most one pixel per CSS pixel so phone DPR does not multiply its cost.
export function GarageGlow() {
  const { gl, scene, camera, size, viewport } = useThree();
  const effects = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    // Give bright fixture cores a soft halo while preserving the dark room.
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.24, 0.15, 1.6);
    const output = new OutputPass();
    composer.addPass(render); composer.addPass(bloom); composer.addPass(output);
    return { composer, render, bloom, output };
  }, [gl, scene, camera]);
  useEffect(() => {
    effects.composer.setPixelRatio(Math.min(1, viewport.dpr));
    effects.composer.setSize(size.width, size.height);
  }, [effects, size.width, size.height, viewport.dpr]);
  useEffect(() => () => {
    effects.render.dispose(); effects.bloom.dispose(); effects.output.dispose(); effects.composer.dispose();
  }, [effects]);
  useFrame((_, delta) => {
    const exposure = gl.toneMappingExposure;
    try { gl.toneMappingExposure = exposure * 0.8; effects.composer.render(delta); }
    finally { gl.toneMappingExposure = exposure; }
  }, 1);
  return null;
}
