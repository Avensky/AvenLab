import { Material, Mesh, MeshStandardMaterial, type Object3D } from "three";

// Presentation edits from the source model's Sketchfab viewer are absent from
// its Blender GLB. Values below are linear RGB, not CSS/sRGB colors.
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
    material.envMapIntensity = 0.8;
    switch (material.name.trim()) {
      case "BLACK METAL":
        material.emissive.setRGB(0.00373248, 0.95530061, 0.0041025);
        material.emissiveIntensity = 10;
        break;
      case "LIGHT":
        material.emissive.setRGB(0.02350918, 0.95040749, 0.00495542);
        material.emissiveIntensity = 10;
        break;
      case "SDC":
        material.color.setRGB(0.05491889, 0.98496767, 0.00272162);
        material.emissive.setRGB(0.01799614, 0.94552903, 0.00267312);
        material.emissiveIntensity = 10;
        break;
      case "Sol cubique":
        material.color.setRGB(0.09950844, 0.09950844, 0.09950844);
        material.metalness = 1;
        material.roughness = 0.4;
        break;
      case "Sol_CAR":
        material.color.setRGB(0.85101709, 0.66039451, 0.66039451);
        material.metalness = 1;
        material.roughness = 0.16;
        break;
      case "Murs":
        material.color.setRGB(0.04489505, 0.03755509, 0.03755509);
        break;
      case "Haut":
        material.color.setRGB(0.00308228, 0.00285042, 0.00285042);
        break;
    }
    return material;
  };
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(prepare) : prepare(object.material);
  });
  // Geometry and textures still belong to useGLTF's cache. Only our material
  // copies are owned by this display, including on selection-screen remounts.
  return { root, dispose: () => materials.forEach(material => material.dispose()) };
}
