import { Color, Float32BufferAttribute, MathUtils, SkinnedMesh, Vector2, type BufferGeometry, type MeshStandardMaterial, type Object3D } from "three";
import type { CharacterLook } from "./characterCatalog";

const FACE_SHAPES = ["smile", "brow", "blink"] as const;
type FaceShape = typeof FACE_SHAPES[number];

const softBand = (distance: number, inner: number, outer: number) => 1 - MathUtils.smoothstep(distance, inner, outer);
export const VILLAGER_EYES = {
  female: { x: .0275, y: 1.5583, z: .0895, radius: .006, lip: 1.501 },
  male: { x: .0282, y: 1.7219, z: .1105, radius: .0066, lip: 1.648 },
};
const faceMesh = (root: Object3D) => root.getObjectByName("HEAD_FACE4") ?? root.getObjectByName("HEAD_WARRIOR");

/** Use bind-pose position so color follows the skinned eyes and brows. */
export function prepareVillagerFaceColors(materials: Iterable<MeshStandardMaterial>, female: boolean) {
  const fit = VILLAGER_EYES[female ? "female" : "male"];
  const irisColor = { value: new Color() };
  const browColor = { value: new Color() };
  const browStrength = { value: 0 };
  for (const material of materials) {
    const iris = material.name === (female ? "MAT_Details" : "MAT_Eyes");
    if (!iris && material.name !== "MAT_LashBrow") continue;
    material.customProgramCacheKey = () => iris ? "villager-iris" : "villager-brow";
    material.onBeforeCompile = shader => {
      shader.uniforms.faceTint = iris ? irisColor : browColor;
      shader.uniforms.eyeCenter = { value: new Vector2(fit.x, fit.y) };
      shader.uniforms.irisRadius = { value: fit.radius };
      shader.uniforms.browStrength = browStrength;
      shader.vertexShader = "varying vec3 vFaceBind;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>", "#include <begin_vertex>\nvFaceBind = position;",
      );
      shader.fragmentShader = `varying vec3 vFaceBind;
        uniform vec3 faceTint;
        uniform vec2 eyeCenter;
        uniform float irisRadius;
        uniform float browStrength;
        ` + shader.fragmentShader.replace("#include <map_fragment>", iris ? `
          #include <map_fragment>
          vec2 eye = (vec2(abs(vFaceBind.x), vFaceBind.y) - eyeCenter) / irisRadius;
          float radial = length(eye);
          float streak = sin(atan(eye.y, eye.x + 0.00001) * 31.0 + radial * 14.0);
          vec3 pigment = faceTint * (0.78 + 0.14 * streak);
          pigment *= 1.0 - 0.73 * smoothstep(0.78, 1.0, radial);
          pigment = mix(vec3(0.0015), pigment, smoothstep(0.36, 0.44, radial));
          diffuseColor.rgb = mix(diffuseColor.rgb, pigment, 1.0 - smoothstep(0.95, 1.06, radial));
        ` : `
          #include <map_fragment>
          float brow = smoothstep(eyeCenter.y + 0.009, eyeCenter.y + 0.014, vFaceBind.y) * browStrength;
          float detail = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, faceTint * (0.64 + 0.54 * detail), brow);
        `);
    };
  }
  return (look: CharacterLook) => {
    irisColor.value.set(look.iris);
    browStrength.value = look.brow ? 1 : 0;
    if (look.brow) browColor.value.set(look.brow);
  };
}

/** Masks follow the two villagers' bind-pose coordinates in meters. */
export function addVillagerFaceShapes(root: Object3D, female = true) {
  const fit = VILLAGER_EYES[female ? "female" : "male"];
  const owned: BufferGeometry[] = [];
  faceMesh(root)?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
    const material = mesh.material.name;
    const skin = material === "MAT_SkinFace";
    const lash = material === "MAT_LashBrow";
    const eye = material === "MAT_Cornea" || material === "MAT_Eyes";
    const details = material === "MAT_Details";
    const positions = mesh.geometry.getAttribute("position");
    if (!positions || !(skin || lash || eye || details) || mesh.geometry.morphAttributes.position?.length) return;

    const smile = new Float32Array(positions.count * 3);
    const brow = new Float32Array(positions.count * 3);
    const blink = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const side = Math.abs(x), offset = i * 3;
      const front = MathUtils.smoothstep(z, fit.z - .024, fit.z - .005);
      const eyeWidth = softBand(Math.abs(side - fit.x), .011, .027);
      if (skin || details) {
        const lip = softBand(Math.abs(y - fit.lip), .006, .021) * softBand(side, .023, .045) * front;
        const corner = MathUtils.smoothstep(side, .004, .024) * lip;
        smile[offset] = Math.sign(x) * (.0032 * lip);
        smile[offset + 1] = .009 * corner - .001 * lip;
      }
      if (skin || lash) {
        const eyebrow = MathUtils.smoothstep(y, fit.y + .005, fit.y + .017)
          * softBand(Math.abs(y - fit.y - .017), .005, .026);
        brow[offset + 1] = .008 * eyebrow * eyeWidth * front;
      }
      const eyeball = eye || (details && y > fit.y - .018);
      const lid = eyeWidth * softBand(Math.abs(y - fit.y + .003), .012, .024) * front;
      if (eyeball || skin || lash) {
        const close = eyeball ? .94 : lid * (lash ? softBand(Math.abs(y - fit.y + .006), .011, .021) : 1);
        blink[offset + 1] = (fit.y - .005 + .07 * (side - fit.x) - y) * close;
        if (eyeball) blink[offset + 2] = -.0025;
      }
    }

    const geometry = mesh.geometry.clone();
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = [smile, brow, blink].map((offsets, i) => {
      const attribute = new Float32BufferAttribute(offsets, 3);
      attribute.name = FACE_SHAPES[i];
      return attribute;
    });
    mesh.geometry = geometry;
    mesh.updateMorphTargets();
    owned.push(geometry);
  });
  return owned;
}

export function driverFaceTargets(root: Object3D, shape: FaceShape) {
  const targets: { mesh: SkinnedMesh; index: number }[] = [];
  faceMesh(root)?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const index = mesh.morphTargetDictionary?.[shape];
    if (index !== undefined && mesh.morphTargetInfluences) targets.push({ mesh, index });
  });
  return targets;
}
