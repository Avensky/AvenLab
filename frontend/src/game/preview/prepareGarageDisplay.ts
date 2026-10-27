import { Material, Mesh, MeshStandardMaterial, type Object3D } from "three";

// Presentation edits from the source model's Sketchfab viewer are absent from
// its Blender GLB. Keep the source hues but temper their emission for this
// dark showroom. Values below are linear RGB, not CSS/sRGB colors.
// https://sketchfab.com/3d-models/garage-followers-special-71b1b4d569ec4c9788c76f4c3d56b461
export function prepareGarageDisplay(scene: Object3D) {
  const root = scene.clone(true);
  for (const child of [...root.children]) {
    const name = String(child.userData.name ?? child.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (name === "lambotm") child.removeFromParent();
  }
  const materials = new Map<Material, Material>();
  const prepare = (source: Material) => {
    const existing = materials.get(source);
    if (existing) return existing;
    const material = source.clone();
    materials.set(source, material);
    if (!(material instanceof MeshStandardMaterial)) return material;
    material.envMapIntensity = 0.45;
    switch (material.name.trim()) {
      case "BLACK METAL":
        material.emissive.setRGB(0.00373248, 0.95530061, 0.0041025);
        material.emissiveIntensity = 2.4;
        break;
      case "LIGHT":
        material.emissive.setRGB(0.02350918, 0.95040749, 0.00495542);
        // Native counter faces and the horizontal rack bars share this slot.
        // Bright cores lift both fixtures without adding a broad green light.
        material.emissiveIntensity = 4;
        break;
      case "SDC":
        material.color.setRGB(0.008, 0.08, 0.002);
        material.emissive.setRGB(0.01799614, 0.94552903, 0.00267312);
        material.emissiveIntensity = 2;
        break;
      case "BARR LTTRl":
      case "INOX":
        material.color.setRGB(0.7, 0.74, 0.8);
        material.metalness = 0.35;
        material.roughness = 0.22;
        material.envMapIntensity = 1;
        break;
      case "BASE":
      case "Material.004":
        material.color.setRGB(0.22, 0.24, 0.28);
        material.metalness = 0.25;
        material.roughness = 0.32;
        material.envMapIntensity = 0.9;
        break;
      case "Material.006":
        material.emissive.setRGB(1, 1, 1);
        material.emissiveIntensity = 3;
        break;
      case "Sol cubique":
        material.color.setRGB(0.005, 0.005, 0.006);
        material.metalness = 1;
        material.roughness = 0.08;
        break;
      case "Sol_CAR":
        material.color.setRGB(0.008, 0.008, 0.009);
        material.metalness = 1;
        material.roughness = 0.2;
        break;
      case "Fond":
      case "Murs":
        material.color.setRGB(0.075, 0.08, 0.095);
        material.metalness = 0.4;
        material.roughness = 0.24;
        material.envMapIntensity = 1.1;
        break;
      case "Material.001":
        material.color.setRGB(0.006, 0.006, 0.007);
        material.roughness = 0.2;
        break;
      case "Haut":
        material.color.setRGB(0.025, 0.028, 0.035);
        material.metalness = 0.3;
        material.roughness = 0.4;
        material.envMapIntensity = 0.9;
        break;
    }
    return material;
  };
  root.traverse(object => {
    // The authored four-corner fixture stays in the GLB; the rotating display
    // and its reflection probe omit it. Never hide or edit the cached source.
    if (String(object.userData.name ?? object.name) === "4*4") object.visible = false;
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(prepare) : prepare(object.material);
  });
  // Geometry and textures still belong to useGLTF's cache. Only our material
  // copies are owned by this display, including on selection-screen remounts.
  return { root, dispose: () => materials.forEach(material => material.dispose()) };
}
