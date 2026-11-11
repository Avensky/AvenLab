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

/** Clear the right cup, shape the over-skirt neckline, and fit the tucked waist. */
export function fitSweetheartCorset(root: Object3D, body: BufferGeometry) {
  const surface = rightCupSurface(body);
  const ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
  const intersection = new Vector3();
  const panels: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  for (const fit of ["TUCKED", "OVER"]) {
    root.getObjectByName(`CLOTH_CORSET_${fit}`)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
      const fabric = mesh.material.userData.color_slot === "fabric";
      if (fit === "OVER" && !fabric) return;
      const source = mesh.geometry;
      const fitted = source.clone();
      const position = fitted.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        if (fit === "TUCKED" && y < 1.238) {
          const radius = Math.hypot(x, z - .025);
          if (radius === 0) continue;
          const clearance = (.006 + .005 * MathUtils.smoothstep(y, 1.098, 1.122))
            * (1 - MathUtils.smoothstep(y, 1.195, 1.238));
          const scale = 1 + clearance / radius;
          position.setXYZ(i, x * scale, y, .025 + (z - .025) * scale);
          continue;
        }
        if (!fabric) continue;
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
        // Lift the two over-skirt cup crests, tapering into the lacing and sides.
        const side = Math.abs(x);
        const lift = fit === "OVER" ? MathUtils.smoothstep(side, .038, .057) * (1 - MathUtils.smoothstep(side, .104, .132))
          * MathUtils.smoothstep(y, 1.259, 1.305) * MathUtils.smoothstep(z, .036, .065) : 0;
        if (depth !== z || lift > 0) position.setXYZ(i, x, y + .009 * lift, depth + .002 * lift);
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
