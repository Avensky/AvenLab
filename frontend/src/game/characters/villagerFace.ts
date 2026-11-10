import { Float32BufferAttribute, MathUtils, SkinnedMesh, type BufferGeometry, type Object3D } from "three";

const FACE_SHAPES = ["smile", "brow", "blink"] as const;
type FaceShape = typeof FACE_SHAPES[number];

const softBand = (distance: number, inner: number, outer: number) => 1 - MathUtils.smoothstep(distance, inner, outer);

/** These masks are authored in Village Lady's bind-pose coordinates, in meters. */
export function addVillagerFaceShapes(root: Object3D) {
  const owned: BufferGeometry[] = [];
  root.getObjectByName("HEAD_FACE4")?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
    const material = mesh.material.name;
    const skin = material === "MAT_SkinFace";
    const lash = material === "MAT_LashBrow";
    const eye = material === "MAT_Cornea";
    const details = material === "MAT_Details";
    const positions = mesh.geometry.getAttribute("position");
    if (!positions || !(skin || lash || eye || details) || mesh.geometry.morphAttributes.position?.length) return;

    const smile = new Float32Array(positions.count * 3);
    const brow = new Float32Array(positions.count * 3);
    const blink = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const side = Math.abs(x), offset = i * 3;
      const front = MathUtils.smoothstep(z, .065, .084);
      const eyeWidth = softBand(Math.abs(side - .027), .011, .027);
      if (skin || details) {
        const lip = softBand(Math.abs(y - 1.501), .006, .021) * softBand(side, .023, .045) * front;
        const corner = MathUtils.smoothstep(side, .004, .024) * lip;
        smile[offset] = Math.sign(x) * (.0032 * lip);
        smile[offset + 1] = .009 * corner - .001 * lip;
      }
      if (skin || lash) {
        const eyebrow = MathUtils.smoothstep(y, 1.563, 1.575) * softBand(Math.abs(y - 1.575), .005, .026);
        brow[offset + 1] = .008 * eyebrow * eyeWidth * front;
      }
      const eyeball = eye || (details && y > 1.54);
      const lid = eyeWidth * softBand(Math.abs(y - 1.555), .012, .024) * front;
      if (eyeball || skin || lash) {
        const close = eyeball ? .94 : lid * (lash ? softBand(Math.abs(y - 1.552), .011, .021) : 1);
        blink[offset + 1] = (1.553 + .07 * (side - .026) - y) * close;
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
  root.getObjectByName("HEAD_FACE4")?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const index = mesh.morphTargetDictionary?.[shape];
    if (index !== undefined && mesh.morphTargetInfluences) targets.push({ mesh, index });
  });
  return targets;
}
