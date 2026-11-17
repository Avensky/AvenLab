import { SkinnedMesh, type Object3D } from "three";

/** Three's recursive raycast also visits invisible fit variants and the masked body. */
export function skipHiddenCharacterRaycasts(root: Object3D) {
  const restore: (() => void)[] = [];
  root.traverse(part => {
    if (!(part instanceof SkinnedMesh)) return;
    const raycast = part.raycast;
    part.raycast = (raycaster, intersections) => {
      for (let ancestor: Object3D | null = part; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) return;
      }
      raycast.call(part, raycaster, intersections);
    };
    restore.push(() => { part.raycast = raycast; });
  });
  return () => restore.forEach(reset => reset());
}
