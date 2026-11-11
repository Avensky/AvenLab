import { MathUtils, Ray, SkinnedMesh, Triangle, Vector3, type BufferGeometry, type Object3D } from "three";

function rightCupSurface(body: BufferGeometry) {
  const positions = body.getAttribute("position");
  const indices = body.getIndex();
  const surface: Triangle[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  if (!indices) return surface;
  for (let i = 0; i < indices.count; i += 3) {
    a.fromBufferAttribute(positions, indices.getX(i));
    b.fromBufferAttribute(positions, indices.getX(i + 1));
    c.fromBufferAttribute(positions, indices.getX(i + 2));
    if (Math.min(a.x, b.x, c.x) > -.023 || Math.max(a.x, b.x, c.x) < -.132
      || Math.max(a.y, b.y, c.y) < 1.266 || Math.min(a.y, b.y, c.y) > 1.318
      || Math.max(a.z, b.z, c.z) < .025) continue;
    surface.push(new Triangle(a.clone(), b.clone(), c.clone()));
  }
  return surface;
}

/** Clear the right cup, fit the over-skirt cup edges, and shape the tucked waist. */
export function fitSweetheartCorset(root: Object3D, body: BufferGeometry) {
  const surface = rightCupSurface(body);
  const ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
  const intersection = new Vector3();
  const panels: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  for (const fit of ["TUCKED", "OVER"]) {
    const overSkirt = fit === "OVER";
    root.getObjectByName(`CLOTH_CORSET_${fit}`)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
      const { color_slot: colorSlot } = mesh.material.userData;
      const fabric = colorSlot === "fabric";
      if (overSkirt && !fabric && colorSlot !== "accent" && colorSlot !== "hardware") return;
      const source = mesh.geometry;
      const fitted = source.clone();
      const position = fitted.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        if (!overSkirt && y < 1.238) {
          const radius = Math.hypot(x, z - .025);
          if (radius === 0) continue;
          const clearance = (.006 + .005 * MathUtils.smoothstep(y, 1.098, 1.122))
            * (1 - MathUtils.smoothstep(y, 1.195, 1.238));
          const scale = 1 + clearance / radius;
          position.setXYZ(i, x * scale, y, .025 + (z - .025) * scale);
          continue;
        }
        const side = Math.abs(x);
        // Ease the inner cup edges outward while keeping the center opening.
        const innerCup = overSkirt ? MathUtils.smoothstep(side, .010, .019) * (1 - MathUtils.smoothstep(side, .038, .060))
          * MathUtils.smoothstep(y, 1.243, 1.270) * MathUtils.smoothstep(z, .074, .096) : 0;
        if (!fabric) {
          // Keep the eyelets and laces sitting on the adjusted cup edges.
          if (innerCup > 0) position.setZ(i, z + .006 * innerCup);
          continue;
        }
        let depth = z;
        if (x > -.132 && x < -.023 && z > .025 && y > 1.266) {
          ray.origin.set(x, y, .25);
          let surfaceDepth = z - .009;
          for (const { a, b, c } of surface) {
            if (ray.intersectTriangle(a, b, c, false, intersection)) surfaceDepth = Math.max(surfaceDepth, intersection.z);
          }
          // Broad upper faces span the curved chest, so allow clearance between vertices as well.
          const blend = MathUtils.smoothstep(-x, .023, .033) * (1 - MathUtils.smoothstep(-x, .112, .132))
            * MathUtils.smoothstep(z, .025, .045) * MathUtils.smoothstep(y, 1.266, 1.292);
          depth += (surfaceDepth + .009 - z) * blend;
        }
        let width = x;
        let height = y;
        if (overSkirt) {
          // Lift the two cup crests, tapering into the lacing and sides.
          const lift = MathUtils.smoothstep(side, .038, .057) * (1 - MathUtils.smoothstep(side, .104, .132))
            * MathUtils.smoothstep(y, 1.259, 1.305) * MathUtils.smoothstep(z, .036, .065);
          // Ease the right outer edge away from the chest as it turns into the underarm.
          const underarm = MathUtils.smoothstep(-x, .084, .108) * (1 - MathUtils.smoothstep(-x, .124, .144))
            * MathUtils.smoothstep(y, 1.255, 1.284) * MathUtils.smoothstep(z, .018, .056);
          width -= .007 * underarm + Math.sign(x) * .002 * innerCup;
          height += .009 * lift + .005 * underarm + .004 * innerCup;
          depth += .002 * lift + .009 * underarm + .006 * innerCup;
        }
        if (width !== x || height !== y || depth !== z) position.setXYZ(i, width, height, depth);
      }
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
      mesh.geometry = fitted;
      panels.push({ mesh, source, fitted });
    });
  }
  return () => {
    for (const { mesh, source, fitted } of panels) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}
