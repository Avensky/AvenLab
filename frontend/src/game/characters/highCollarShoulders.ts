import { MathUtils, Matrix4, SkinnedMesh, type Object3D, type Skeleton } from "three";

/** Drive the two authored shoulder folds from the arm elevation relative to the chest. */
export function prepareHighCollarShoulders(group: Object3D, skeleton: Skeleton) {
  const parts: { mesh: SkinnedMesh; weights: number[]; left: number; right: number }[] = [];
  group.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const left = mesh.morphTargetDictionary?.CorsetShoulderL;
    const right = mesh.morphTargetDictionary?.CorsetShoulderR;
    if (left !== undefined && right !== undefined && mesh.morphTargetInfluences) {
      parts.push({ mesh, weights: mesh.morphTargetInfluences, left, right });
    }
  });
  if (!parts.length) return;
  const chest = skeleton.bones.findIndex(bone => bone.name === "spine_05");
  const leftArm = skeleton.bones.findIndex(bone => bone.name === "upperarm_l");
  const rightArm = skeleton.bones.findIndex(bone => bone.name === "upperarm_r");
  if (chest < 0 || leftArm < 0 || rightArm < 0) return;

  // Both waist fits and all material groups share Vesper's garment bind space.
  const bind = parts[0].mesh.bindMatrix;
  const chestInverse = new Matrix4(), relative = new Matrix4();
  function posed(target: Matrix4, joint: number) {
    const bone = skeleton.bones[joint];
    bone.updateWorldMatrix(true, false);
    return target.multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[joint]).multiply(bind);
  }
  function lift(joint: number, side: number) {
    posed(relative, joint).premultiply(chestInverse);
    // The signed Y component of the bind-space lateral axis measures lift.
    return MathUtils.smoothstep(side * relative.elements[1], .08, .88);
  }
  return () => {
    posed(chestInverse, chest).invert();
    const leftLift = lift(leftArm, 1), rightLift = lift(rightArm, -1);
    for (const part of parts) {
      part.weights[part.left] = leftLift;
      part.weights[part.right] = rightLift;
    }
  };
}
