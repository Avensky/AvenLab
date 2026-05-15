import { memo } from "react";
import { GLBInstance } from "./GLBInstance";
import type { DebugAabbBox } from "../../store/store";

type Props = {
  blockId: string;
  box: DebugAabbBox;
};

// function getBuildingPath(blockId: string, visual: string) {
//   return `/models/blocks/${blockId}/buildings/${visual}.glb`;
// }

export const DetailedBuildingLOD = memo(function DetailedBuildingLOD({
  blockId,
  box,
}: Props) {
//   const path = getBuildingPath(blockId, box.visual);
  const path = `/models/blocks/${blockId}/buildings/${box.id}.glb`;
  return <GLBInstance path={path} box={box} />;
});