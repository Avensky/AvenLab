import { DirectionalLight, Frustum, PointLight, SpotLight, type Object3D } from "three";

// Reuse frusta instead of allocating them every frame. Keep casters that can
// affect a real shadow camera even when they are behind the player's camera.
export function collectCityShadowFrusta(scene: Object3D, result: Frustum[]) {
  let count = 0;
  scene.traverseVisible(object => {
    if (!(object instanceof DirectionalLight || object instanceof SpotLight || object instanceof PointLight) || !object.castShadow) return;
    object.updateWorldMatrix(true, false);
    if (object instanceof DirectionalLight || object instanceof SpotLight) object.target.updateWorldMatrix(true, false);
    for (let face = 0; face < object.shadow.getViewportCount(); face++) {
      object.shadow.updateMatrices(object, face);
      (result[count] ??= new Frustum()).copy(object.shadow.getFrustum()); count++;
    }
  });
  result.length = count;
  return result;
}
