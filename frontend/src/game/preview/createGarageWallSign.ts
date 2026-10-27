import { Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, Vector3, type Object3D } from "three";

// Seven-segment order: top, upper-right, lower-right, bottom,
// lower-left, upper-left, middle. "y" is the display's readable Y form.
const PLAY_SEGMENTS = ["abefg", "def", "abcefg", "bcdfg"] as const;
const SEGMENTS = [
  [0, 6.1, 0], [3.3, 3.05, 1], [3.3, -3.05, 1], [0, -6.1, 0],
  [-3.3, -3.05, 1], [-3.3, 3.05, 1], [0, 0, 0],
] as const;

// The original counter has separate baked 999 and 1000 light layers. Replace
// both on the display clone, retaining its authored black housing and glass.
// Geometry is shared by two tiny instance batches; no text/font/image download.
export function createGarageWallSign(root: Object3D) {
  const find = (name: string) => {
    let match: Object3D | undefined;
    root.traverse(object => {
      const original = String(object.userData.name ?? object.name).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!match && original === name) match = object;
    });
    return match;
  };
  const housing = find("cube023"), oldDigits = find("cube024");
  if (!housing || !oldDigits) return { dispose: () => {} };
  oldDigits.visible = false;
  const otherDigits = find("1000"); if (otherDigits) otherDigits.visible = false;

  const shape = new Shape();
  shape.moveTo(-0.5, 0); shape.lineTo(-0.38, -0.5); shape.lineTo(0.38, -0.5);
  shape.lineTo(0.5, 0); shape.lineTo(0.38, 0.5); shape.lineTo(-0.38, 0.5); shape.closePath();
  const geometry = new ShapeGeometry(shape);
  const on = new MeshStandardMaterial({ color: 0x273321, roughness: 0.4, metalness: 0.1 });
  on.emissive.setRGB(0.02350918, 0.95040749, 0.00495542); on.emissiveIntensity = 2.4;
  const off = new MeshStandardMaterial({ color: 0x101512, roughness: 0.5, metalness: 0.1 });
  const litCount = PLAY_SEGMENTS.reduce((count, segments) => count + segments.length, 0);
  const lit = new InstancedMesh(geometry, on, litCount), dark = new InstancedMesh(geometry, off, 28 - litCount);
  lit.name = "garage-sign-lit-segments"; dark.name = "garage-sign-unlit-segments";
  const matrix = new Matrix4(), rotation = new Quaternion(), position = new Vector3(), scale = new Vector3();
  let litIndex = 0, darkIndex = 0;
  PLAY_SEGMENTS.forEach((enabled, digit) => SEGMENTS.forEach(([x, y, vertical], segment) => {
    // Measured in the original housing's local coordinates, ahead of its glass.
    position.set(-0.018726 + digit * 9.97392 + x, 5.094927 + y, 0.85);
    rotation.setFromAxisAngle(new Vector3(0, 0, 1), vertical ? Math.PI / 2 : 0);
    scale.set(vertical ? 5.1 : 6.6, 1.6, 1);
    matrix.compose(position, rotation, scale);
    if (enabled.includes("abcdefg"[segment])) lit.setMatrixAt(litIndex++, matrix);
    else dark.setMatrixAt(darkIndex++, matrix);
  }));
  for (const mesh of [lit, dark]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  const sign = new Group(); sign.name = "garage-wall-sign"; sign.userData.text = "PLAY";
  sign.add(lit, dark); housing.add(sign);
  return { dispose: () => { lit.dispose(); dark.dispose(); geometry.dispose(); on.dispose(); off.dispose(); } };
}
