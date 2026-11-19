import { Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, type Matrix4 } from "three";
import type { DriverAppearance } from "../../game/characters/driverAppearance";
import { writeInstanceMatrix } from "../writeInstanceMatrix.ts";
import { createDriverGeometries, DRIVER_PARTS, type DriverPart } from "./driverGeometry.ts";

export type DriverPalette = ReturnType<typeof createDriverPalette>;
export function createDriverPalette() {
  return { source: null as DriverAppearance | null, skin: new Color(), hair: new Color(), hat: new Color(), top: new Color(), bottom: new Color() };
}
/** Snapshot objects can change at network cadence; parse a color only when its
 * value changes. The five Color instances belong to one reusable roster row. */
export function updateDriverPalette(palette: DriverPalette, appearance: DriverAppearance) {
  const previous = palette.source;
  if (previous?.skin !== appearance.skin) palette.skin.set(appearance.skin);
  if (previous?.hair !== appearance.hair) palette.hair.set(appearance.hair);
  if (previous?.headwearColor !== appearance.headwearColor) palette.hat.set(appearance.headwearColor);
  if (previous?.top !== appearance.top) palette.top.set(appearance.top);
  if (previous?.bottom !== appearance.bottom) palette.bottom.set(appearance.bottom);
  palette.source = appearance;
}

/** At most eight draws across the room, independent of vehicle/wardrobe count.
 * Standard instance colors retain broad clothing colors without custom shaders. */
export function createDriverBatch(capacity: number) {
  const root = new Group();
  root.name = "gameplay-driver-lod3";
  const geometry = createDriverGeometries();
  const material = new MeshLambertMaterial({ color: 0xffffff });
  material.name = "gameplay-driver-flat-colors";
  const batches = {} as Record<DriverPart, InstancedMesh>;
  const counts = {} as Record<DriverPart, number>;
  const matrixDirty = {} as Record<DriverPart, boolean>;
  const colorDirty = {} as Record<DriverPart, boolean>;
  for (const part of DRIVER_PARTS) {
    const mesh = new InstancedMesh(geometry[part], material, capacity);
    mesh.name = `gameplay-driver-${part}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    // These occupants never participate in world picking, shadows, or collision.
    mesh.raycast = () => {};
    root.add(mesh);
    batches[part] = mesh;
  }
  function write(part: DriverPart, matrix: Matrix4, color: Color) {
    const mesh = batches[part], index = counts[part]++;
    if (index >= capacity) throw new RangeError("Driver batch capacity exceeded");
    matrixDirty[part] = writeInstanceMatrix(mesh, index, matrix) || matrixDirty[part];
    const colors = mesh.instanceColor!.array, offset = index * 3;
    if (colors[offset] !== Math.fround(color.r) || colors[offset + 1] !== Math.fround(color.g) || colors[offset + 2] !== Math.fround(color.b)) {
      mesh.setColorAt(index, color);
      colorDirty[part] = true;
    }
  }
  let disposed = false;
  return {
    root,
    batches,
    begin() {
      for (const part of DRIVER_PARTS) { counts[part] = 0; matrixDirty[part] = false; colorDirty[part] = false; }
    },
    add(matrix: Matrix4, appearance: DriverAppearance, palette: DriverPalette) {
      write("skin", matrix, palette.skin);
      write(appearance.body, matrix, palette.top);
      write("bottom", matrix, palette.bottom);
      if (appearance.hairStyle !== "none") write(appearance.hairStyle === "long" ? "longHair" : "shortHair", matrix, palette.hair);
      if (appearance.headwear === "hat") write("hat", matrix, palette.hat);
    },
    end() {
      for (const part of DRIVER_PARTS) {
        const mesh = batches[part];
        mesh.count = counts[part];
        mesh.visible = mesh.count > 0;
        if (matrixDirty[part]) mesh.instanceMatrix.needsUpdate = true;
        if (colorDirty[part]) mesh.instanceColor!.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const part of DRIVER_PARTS) { batches[part].dispose(); geometry[part].dispose(); }
      material.dispose();
      root.clear();
    },
  };
}
