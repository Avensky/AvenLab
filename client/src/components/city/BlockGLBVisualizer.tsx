import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { BlockColliderFile, BlockObject } from "../../store/store";

type Props = {
  block: BlockColliderFile;
  showRoads?: boolean;
  showBuildings?: boolean;
};

const ROAD_VISUALS: Record<string, string> = {
  road_wide: "/models/roads/road_wide.glb",
  road_narrow: "/models/roads/road_narrow.glb",
  intersection: "/models/roads/intersection.glb",
};

function getBuildingPath(blockId: string, visual: string) {
  return `/models/blocks/${blockId}/buildings/${visual}.glb`;
}

function getObjectPath(blockId: string, obj: BlockObject): string | null {
  if (obj.kind === "road" || obj.kind === "intersection") {
    return ROAD_VISUALS[obj.visual] ?? null;
  }

  if (obj.kind === "building") {
    return getBuildingPath(blockId, obj.visual);
  }

  return null;
}

function GLBInstance({
  path,
  object,
}: {
  path: string;
  object: BlockObject;
}) {
  const gltf = useGLTF(path);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  return (
    <primitive
      object={scene}
      position={object.pos}
      quaternion={new THREE.Quaternion(...object.rot)}
    />
  );
}

export function BlockGLBVisualizer({
  block,
  showRoads = true,
  showBuildings = true,
}: Props) {
  const objects = useMemo(() => {
    const result: BlockObject[] = [];
    if (showRoads) result.push(...block.roads);
    if (showBuildings) result.push(...block.buildings);
    return result;
  }, [block, showRoads, showBuildings]);

  return (
    <group name={`block-glb-${block.block_id}`}>
      {objects.map((obj) => {
        if (obj.state === "removed") return null;

        const path = getObjectPath(block.block_id, obj);
        if (!path) return null;

        return <GLBInstance key={obj.id} path={path} object={obj} />;
      })}
    </group>
  );
}