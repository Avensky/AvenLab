import { MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';

/** Repairs operate only on instance-owned material clones. The AE86 export
 * leaves these surfaces at glTF's white/metallic defaults; authored textures
 * and deliberately colored materials must remain intact. */
export function repairAe86Material(material: Material) {
  if (!(material instanceof MeshStandardMaterial) ||
      Math.min(material.color.r,material.color.g,material.color.b)<.95) return;
  const name=material.name.replace(/\.\d+$/,'');
  // The shipped wheel is an opaque leather hub and rim exported in BLEND
  // mode, with a single white texel instead of the original wheel texture.
  const image = material.map?.image as { width?: number; height?: number } | undefined;
  if (name === "SteeringWheel" && (!material.map || image?.width === 1 && image?.height === 1)) {
    material.color.set("#292a2d");
    material.roughness = .78;
    material.metalness = 0;
    material.transparent = false;
    material.opacity = 1;
    material.alphaTest = 0;
    material.depthWrite = true;
    material.needsUpdate = true;
    return;
  }
  if (material.map) return;
  const surfaces: Record<string,[string,number,number]> = {
    TireMaterial:['#191b1e',.92,0], RimMaterial:['#858b94',.4,.8],
    'Brake Disc':['#898e94',.48,.8], BrakeCaliper:['#555c65',.5,.45],
    Interior:['#25272c',.9,0], InteriorPlastic:['#202328',.85,0],
    InteriorPlastic2:['#30343a',.85,0], Seatbelt:['#23252a',.95,0],
    Trim2:['#282c32',.8,0],
  };
  const surface=surfaces[name];if(!surface)return;
  material.color.set(surface[0]);material.roughness=surface[1];material.metalness=surface[2];
}

/** Hard star-like glints are sharp HDR reflections, not a particle effect.
 * Supra ships zero roughness and specularColor > 1. Keep the maps and glass,
 * but bound reflected energy and broaden opaque specular highlights. */
export function repairSupraHighlights(material: Material) {
  if (!(material instanceof MeshStandardMaterial)) return;
  const name=material.name.toLowerCase();
  if(/window|glass|mirror|lightg_material/.test(name))return;
  // These Forza-style body textures store surface data in alpha. Treating that
  // channel as transparency reveals the exhaust through the painted rear shell.
  // Grille cutouts, badges, lamp lenses and actual windows keep their own alpha.
  if (/(?:painttnr|base|carbon\d*|coloured|speculartintg)_material/i.test(name)) {
    material.transparent = false;
    material.opacity = 1;
    material.alphaTest = 0;
    material.alphaMap = null;
    material.depthWrite = true;
    if (material instanceof MeshPhysicalMaterial) material.transmission = 0;
  }
  material.roughness=Math.max(material.roughness,.28);
  if(material instanceof MeshPhysicalMaterial) {
    material.specularColor.setRGB(Math.min(1,material.specularColor.r),Math.min(1,material.specularColor.g),Math.min(1,material.specularColor.b));
    material.specularIntensity=Math.min(1,material.specularIntensity);
    material.clearcoatRoughness=Math.max(.25,material.clearcoatRoughness);
  }
}
