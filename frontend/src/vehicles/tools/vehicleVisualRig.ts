import {
  Group,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from "three";

export type WheelCorner = "fl" | "fr" | "rl" | "rr";

export type WheelVisualAssembly = {
  /** Moves with suspension and steering, but does not spin. */
  carrier: Object3D;
  /** Tire, rim, nuts/trim and rotor children that spin around the axle. */
  spinner: Group;
  /** Imported carrier rotation retained as the model-specific correction. */
  restRotation: Quaternion;
};

export type WheelAssemblySpec = {
  corner: WheelCorner;
  rootNames: readonly string[];
  isFixedPart?: (object: Object3D) => boolean;
};

const DEFAULT_STEERING_AXIS = new Vector3(0, 1, 0);
const DEFAULT_AXLE_AXIS = new Vector3(1, 0, 0);
const scratchBaseRotation = new Quaternion();
const scratchSteerRotation = new Quaternion();

function descendantCount(root: Object3D) {
  let count = 0;
  root.traverse(() => {
    count += 1;
  });
  return count;
}

/**
 * Finds the largest matching object. This handles exports where a wheel root
 * and its nested caliper mesh have the same name.
 */
export function findLargestNamedObject(
  root: Object3D,
  names: readonly string[]
) {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  const matches: Object3D[] = [];

  root.traverse((object) => {
    if (accepted.has(object.name.toLowerCase())) matches.push(object);
  });

  return (
    matches.sort((a, b) => descendantCount(b) - descendantCount(a))[0] ?? null
  );
}

function materialMatches(
  material: Material,
  object: Object3D,
  predicate: (materialName: string, objectName: string) => boolean
) {
  return predicate(material.name ?? "", object.name ?? "");
}

/**
 * Replaces only matching material slots. Multi-material window meshes keep
 * their surrounds, seals, lights and painted trim intact.
 */
export function applyDynamicMaterial(
  root: Object3D,
  replacement: Material,
  predicate: (materialName: string, objectName: string) => boolean
) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;

    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) =>
        materialMatches(material, object, predicate) ? replacement : material
      );
      return;
    }

    if (materialMatches(object.material, object, predicate)) {
      object.material = replacement;
    }
  });
}

/**
 * Extracts one imported wheel corner while preserving its world-space pose.
 * Fixed parts remain on the carrier; all other direct children are placed in
 * a rotating subgroup. Rotors intentionally spin, while calipers do not.
 */
export function extractWheelAssembly(
  visualRoot: Object3D,
  spec: WheelAssemblySpec
): WheelVisualAssembly | null {
  visualRoot.updateWorldMatrix(true, true);
  const carrier = findLargestNamedObject(visualRoot, spec.rootNames);
  if (!carrier) return null;

  carrier.updateWorldMatrix(true, true);
  const importedWorld = carrier.matrixWorld.clone();
  carrier.removeFromParent();
  importedWorld.decompose(carrier.position, carrier.quaternion, carrier.scale);
  carrier.updateMatrix();
  carrier.updateWorldMatrix(true, true);

  const spinner = new Group();
  spinner.name = `${spec.corner.toUpperCase()}_SPINNER`;
  carrier.add(spinner);
  carrier.updateWorldMatrix(true, true);

  const directChildren = [...carrier.children].filter(
    (child) => child !== spinner
  );

  for (const child of directChildren) {
    if (spec.isFixedPart?.(child)) continue;
    spinner.attach(child);
  }

  return {
    carrier,
    spinner,
    restRotation: carrier.quaternion.clone(),
  };
}

export function isBrakeCaliperPart(object: Object3D) {
  const name = object.name.toLowerCase();
  if (name.includes("calliper") || name.includes("caliper")) return true;

  let caliperMaterial = false;
  object.traverse((child) => {
    if (caliperMaterial || !(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    caliperMaterial = materials.some((material) => {
      const materialName = material.name.toLowerCase();
      return (
        materialName.includes("calliper") ||
        materialName.includes("caliper")
      );
    });
  });
  return caliperMaterial;
}

export function applyBackendWheelPose(
  assembly: WheelVisualAssembly,
  position: readonly [number, number, number],
  baseRotation: readonly [number, number, number, number],
  steerAngle: number,
  spinAngle: number,
  steeringAxis = DEFAULT_STEERING_AXIS,
  axleAxis = DEFAULT_AXLE_AXIS
) {
  scratchBaseRotation.set(...baseRotation);
  scratchSteerRotation.setFromAxisAngle(steeringAxis, -steerAngle);

  assembly.carrier.position.set(...position);
  assembly.carrier.quaternion
    .copy(scratchBaseRotation)
    .multiply(scratchSteerRotation)
    .multiply(assembly.restRotation);
  assembly.spinner.quaternion.setFromAxisAngle(axleAxis, spinAngle);
}
