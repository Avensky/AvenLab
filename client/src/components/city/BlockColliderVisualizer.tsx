import { useMemo } from "react";
import { DebugColliders } from "../debugger/DebugColliders";
import type { BlockColliderFile } from "../../store/store";
import { blenderHalfExtentsToThree, blenderPosToThree } from "../../utils/blocktransforms";

export function BlockColliderVisualizer({
  block,
}: {
  block: BlockColliderFile;
}) {

  block.roads.forEach((obj) => {
    if (obj.kind === "road" || obj.kind === "intersection") {
      console.log(obj.id, {
        rawPos: obj.pos,
        threePos: blenderPosToThree(obj.pos),
        rawHalf: obj.half_extents,
        threeHalf: blenderHalfExtentsToThree(obj.half_extents),
        visual: obj.visual,
      });
    }
  });

  const boxes = useMemo(() => {
    return [...block.roads, ...block.buildings].map((obj) => ({
      center: blenderPosToThree(obj.pos),
      half_extents: blenderHalfExtentsToThree(obj.half_extents),
      kind: obj.kind,
    }));
  }, [block]);

  return <DebugColliders boxes={boxes} />;
}