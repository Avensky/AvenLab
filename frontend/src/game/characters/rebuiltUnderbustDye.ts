import { ShaderChunk, type Material, type MeshStandardMaterial } from "three";
import type { PieceColors } from "./clothingPieces";

type DyeGroup = keyof Pick<PieceColors, "color" | "accent" | "panel" | "lining" | "hardware">;

// Reference luminance from the undyed field of each texture, in linear RGB.
const panels: Record<string, { group: DyeGroup; luminance: number }> = {
  "1_FRONT_1652": { group: "color", luminance: .0284 },
  "2_FRONT_1657": { group: "accent", luminance: .0292 },
  "3_FRONT_1662": { group: "lining", luminance: .0259 },
  "4_FRONT_1667": { group: "accent", luminance: .0369 },
  "5_FRONT_1672": { group: "panel", luminance: .0405 },
};

export function tagRebuiltUnderbustMaterial(material: Material) {
  const panel = panels[material.name];
  const group = panel?.group ?? (/^Material\d+$/.test(material.name) ? "hardware" : "color");
  material.userData.underbustDyeGroup = group;
  material.userData.underbustLuminance = panel?.luminance;
  material.userData.color_slot = group === "color" ? "fabric" : group;
  material.userData.dye_with_outfit = false;
}

const gains = new WeakMap<MeshStandardMaterial, { value: number }>();

export function updateUnderbustDyeGain(source: MeshStandardMaterial, material: MeshStandardMaterial, dyed: boolean) {
  const luminance = source.userData.underbustLuminance as number | undefined;
  if (luminance && material.map) {
    let gain = gains.get(material);
    if (!gain) {
      const uniform = { value: 0 };
      gain = uniform;
      gains.set(material, uniform);
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      material.customProgramCacheKey = () => key + "|underbust-dye";
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.underbustDyeGain = uniform;
        shader.fragmentShader = "uniform float underbustDyeGain;\n" + shader.fragmentShader.replace(
          "#include <map_fragment>", ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", `
            if (underbustDyeGain > 0.0) {
              float stitchTone = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              sampledDiffuseColor.rgb = vec3(clamp(stitchTone * underbustDyeGain, 0.0, 1.0));
            }
            diffuseColor *= sampledDiffuseColor;
          `),
        );
      };
      material.needsUpdate = true;
    }
    // The stored atlas is the original dark fabric. Normalize only when dyed
    // so light swatches keep the stitching without inheriting that base color.
    gain.value = dyed ? 1 / luminance : 0;
  }
}
