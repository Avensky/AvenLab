import { useGLTF } from "@react-three/drei";
import {
  Box3,
  Vector3,
  Euler,
  Object3D,
  Mesh,
} from "three";
import { useState } from "react";

// Identify building groups
function isBuildingGroup(obj: Object3D) {
  const box = new Box3().setFromObject(obj);
  const size = new Vector3();
  box.getSize(size);

  // Reject tiny objects
  if (size.x < 10 && size.z < 10) return false;

  // Must be tall enough to be a building
  if (size.y < 6) return false;

  // Must contain multiple child meshes
  let meshCount = 0;
  obj.traverse((c) => {
    if (c instanceof Mesh) meshCount++;
  });

  if (meshCount < 3) return false; // ignore props / tiny structures

  // Accept as building
  return true;
}


// Simple grid-based clustering in XZ plane
function getCellKey(x: number, z: number, cellSize: number) {
  const cx = Math.floor(x / cellSize);
  const cz = Math.floor(z / cellSize);
  return `${cx}_${cz}`;
}

export function BuildingColliderExporter() {
  const { scene } = useGLTF("/models/city.glb");
  const [msg, setMsg] = useState("");

  const exportColliders = () => {
    const colliders: any[] = [];

    const CELL_SIZE = 30;        // world units per cluster cell
    const MIN_EXTENT = 4;        // minimum size per axis to keep collider
    const BASE_ONLY = true;      // clamp to ground-ish height

    scene.traverse((group: any) => {
      if (!isBuildingGroup(group)) return;

      // 1) Collect Box3 per child mesh
      const meshBoxes: Box3[] = [];

      group.traverse((child: any) => {
        if (!(child instanceof Mesh)) return;

        const box = new Box3().setFromObject(child);
        if (!box.isEmpty()) {
          meshBoxes.push(box);
        }
      });

      if (meshBoxes.length === 0) return;

      // 2) Group boxes into cells in XZ
      const cells = new Map<string, Box3[]>();

      for (const box of meshBoxes) {
        const center = new Vector3();
        box.getCenter(center);

        // ignore tiny clutter
        const size = new Vector3();
        box.getSize(size);
        if (size.x < 1 && size.z < 1) continue;

        const key = getCellKey(center.x, center.z, CELL_SIZE);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(box);
      }

      if (cells.size === 0) return;

      const rot = new Euler().setFromRotationMatrix(group.matrixWorld);

      // 3) Create one collider box per cell
      let cellIndex = 0;
      for (const [, cellBoxes] of cells) {
        const combined = new Box3();
        for (const b of cellBoxes) {
          combined.union(b);
        }

        const size = new Vector3();
        const center = new Vector3();
        combined.getSize(size);
        combined.getCenter(center);

        // Filter out very small clusters
        if (
          size.x < MIN_EXTENT ||
          size.z < MIN_EXTENT ||
          size.y < 2
        ) {
          continue;
        }

        // Optionally clamp to base height to avoid huge tall colliders
        let finalCenterY = center.y;
        let finalHeight = size.y;

        // if (BASE_ONLY) {
        //   const baseHeight = Math.min(size.y * 0.25, 8); // up to ~8m tall
        //   finalHeight = baseHeight;
        //   finalCenterY = combined.min.y + baseHeight / 2;
        // }

        colliders.push({
          building: group.name,
          type: "box",
          part: cellIndex++,
          center: [center.x, finalCenterY, center.z],
          size: [size.x, finalHeight, size.z],
          rotation: [rot.x, rot.y, rot.z],
        });
      }
    });

    const blob = new Blob([JSON.stringify(colliders, null, 2)], {
      type: "application/json",
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "city-building-colliders-multi-box.json";
    a.click();

    setMsg(`Exported ${colliders.length} multi-box building colliders ✔`);
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "6rem",
        right: "1rem",
        padding: "0.5rem 1rem",
        background: "rgba(0,0,0,0.7)",
        color: "white",
        borderRadius: "0.5rem",
        fontSize: "0.8rem",
        zIndex: 20,
      }}
    >
      <button onClick={exportColliders}>Export Multi-Box Colliders</button>
      <div>{msg}</div>
    </div>
  );
}
