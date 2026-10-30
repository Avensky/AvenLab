import { Box3, Matrix4, Vector3, type Object3D } from "three";
import type { VehicleColliderShape } from "../../store/session/networkStore";

type Vec3 = [number, number, number];
export type VisualReference = {
  method: "chassis-anchor" | "wheel-plane" | "contact-plane" | "unavailable";
  source: Vec3;
  samples: number;
  wheelSpreadY: number;
};
export type VisualAlignment = {
  method: VisualReference["method"];
  offset: Vec3;
  samples: number;
  wheelSpreadY: number;
  status:
    | "aligned"
    | "disabled"
    | "missing-backend-reference"
    | "missing-asset-reference";
};

// Call on the unanimated model once, before any useFrame poses are applied.
// Chassis bounding boxes include roofs, trim and bumpers and are unsuitable
// substitutes for a semantic chassis anchor or a wheel-center reference.
export function measureVisualReference(
  bodyFrame: Object3D,
  visualRoot: Object3D,
  wheelRoots: readonly (Object3D | null)[],
): VisualReference {
  bodyFrame.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(bodyFrame.matrixWorld).invert();
  const anchor = visualRoot.getObjectByName("CHASSIS_ANCHOR");
  if (anchor) {
    const source = anchor
      .getWorldPosition(new Vector3())
      .applyMatrix4(inverse)
      .toArray();
    return { method: "chassis-anchor", source, samples: 1, wheelSpreadY: 0 };
  }
  const contact = visualRoot.getObjectByName("CONTACT_ANCHOR");
  if (contact)
    return {
      method: "contact-plane",
      source: contact
        .getWorldPosition(new Vector3())
        .applyMatrix4(inverse)
        .toArray(),
      samples: 1,
      wheelSpreadY: 0,
    };
  // Tracked vehicles have a different visual wheel radius from the four
  // support points used by physics. Match the track bottom to nominal contact.
  const tracks = visualRoot.getObjectByName("Tracks");
  if (tracks) {
    const bounds = new Box3().setFromObject(tracks, true);
    if (!bounds.isEmpty()) {
      const bottom = bounds.getCenter(new Vector3());
      bottom.y = bounds.min.y;
      return {
        method: "contact-plane",
        source: bottom.applyMatrix4(inverse).toArray(),
        samples: 1,
        wheelSpreadY: 0,
      };
    }
  }
  const centers: Vector3[] = [];
  for (const root of wheelRoots) {
    if (!root) continue;
    root.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(root, true);
    if (!bounds.isEmpty())
      centers.push(bounds.getCenter(new Vector3()).applyMatrix4(inverse));
  }
  if (centers.length < 2)
    return {
      method: "unavailable",
      source: [0, 0, 0],
      samples: centers.length,
      wheelSpreadY: 0,
    };
  // A median tolerates a slightly asymmetric caliper/trim assembly.
  const heights = centers.map((v) => v.y).sort((a, b) => a - b);
  const middle = Math.floor(heights.length / 2);
  const y =
    heights.length % 2
      ? heights[middle]
      : (heights[middle - 1] + heights[middle]) / 2;
  return {
    method: "wheel-plane",
    source: [0, y, 0],
    samples: centers.length,
    wheelSpreadY: heights.at(-1)! - heights[0],
  };
}

export function solveVisualAlignment(
  reference: VisualReference,
  collider: VehicleColliderShape | undefined,
  enabled = true,
): VisualAlignment {
  const result: VisualAlignment = {
    method: reference.method,
    offset: [0, 0, 0],
    samples: reference.samples,
    wheelSpreadY: reference.wheelSpreadY,
    status: "disabled",
  };
  if (!enabled) return result;
  if (reference.method === "unavailable")
    return { ...result, status: "missing-asset-reference" };
  if (!collider) return { ...result, status: "missing-backend-reference" };
  if (reference.method === "chassis-anchor")
    return {
      ...result,
      status: "aligned",
      offset: collider.chassis_offset.map(
        (v, i) => v - reference.source[i],
      ) as Vec3,
    };
  if (!Number.isFinite(collider.nominal_wheel_center_y))
    return { ...result, status: "missing-backend-reference" };
  const targetY =
    reference.method === "contact-plane"
      ? collider.nominal_wheel_center_y! - collider.wheel_radius
      : collider.nominal_wheel_center_y!;
  // Height only: retain the model's existing X/Z placement, yaw and scale.
  return {
    ...result,
    status: "aligned",
    offset: [0, targetY - reference.source[1], 0],
  };
}
