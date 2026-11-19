import { Frustum, Matrix4, Object3D, Sphere, Vector3, type Camera } from "three";
import type { DriverAppearance } from "../../game/characters/driverAppearance";
import type { PhysicsEntitySnapshot } from "../../store/session/networkStore";
import type { RosterEntity } from "../rosterSelector";
import { createDriverBatch, createDriverPalette, updateDriverPalette } from "./driverBatch.ts";
import { driverCabin } from "./driverCabin.ts";
import { driverVisible } from "./driverVisibility.ts";

type Sources = {
  pose: (id: string) => Pick<PhysicsEntitySnapshot, "position" | "rotation"> | null;
  appearance: (id: string) => DriverAppearance | null | undefined;
  offset: (car: RosterEntity, out: Vector3) => void;
};

/** The fleet owns all working memory; moving drivers only rewrite changed
 * instance data. Sources read live snapshots without a React subscription. */
export function createDriverFleet(cars: readonly RosterEntity[], sources: Sources) {
  const rows = cars.flatMap(car => {
    const cabin = driverCabin(car.vehicle_id);
    return cabin ? [{ car: { ...car, vehicle_id: cabin.model }, cabin, palette: createDriverPalette(), visible: false }] : [];
  });
  const batch = createDriverBatch(rows.length);
  const body = new Object3D(), offset = new Vector3(), matrix = new Matrix4(), projection = new Matrix4();
  const frustum = new Frustum(), sphere = new Sphere(), point = new Vector3();
  let nextVisibility = 0;
  return {
    root: batch.root,
    batches: batch.batches,
    update(camera: Camera, viewportHeight: number, elapsed: number, lowDetail: boolean) {
      const checkVisibility = elapsed >= nextVisibility;
      if (checkVisibility) {
        nextVisibility = elapsed + .10;
        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projection);
      }
      batch.begin();
      for (const row of rows) {
        const appearance = sources.appearance(row.car.id);
        if (!appearance) { row.visible = false; continue; }
        // Culled occupants need no interpolation/matrix work between polls.
        if (!checkVisibility && !row.visible) continue;
        const pose = sources.pose(row.car.id);
        if (!pose) { row.visible = false; continue; }
        body.position.fromArray(pose.position);
        body.quaternion.fromArray(pose.rotation);
        sources.offset(row.car, offset);
        body.position.add(offset.applyQuaternion(body.quaternion));
        body.updateMatrix();
        matrix.multiplyMatrices(body.matrix, appearance.headwear === "hat" ? row.cabin.hat : row.cabin.bare);
        if (checkVisibility) {
          sphere.center.set(0, .26, .10).applyMatrix4(matrix);
          sphere.radius = .74 * row.cabin.units;
          point.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse);
          const depth = -point.z, perspective = camera.projectionMatrix.elements[15] === 0;
          const pixels = .88 * row.cabin.units * viewportHeight * .5 * camera.projectionMatrix.elements[5] / (perspective ? Math.max(.01, depth) : 1);
          row.visible = driverVisible(pixels, depth > 0 && frustum.intersectsSphere(sphere), row.visible, lowDetail);
        }
        if (!row.visible) continue;
        updateDriverPalette(row.palette, appearance);
        batch.add(matrix, appearance, row.palette);
      }
      batch.end();
    },
    dispose: batch.dispose,
  };
}
