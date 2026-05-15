import { Suspense } from "react";
import type { DebugAabbBox } from "../../store/store";
import { JoinedBlockGLB } from "./JoinedBlockGLB";

type Props = {
  blockId: string;
  boxes: DebugAabbBox[];
};

export function BlockGLBVisualizer({ blockId, }: Props) {

  // const firstThreeBuildings = useMemo(() => {
  //   return boxes
  //     .filter((box) => box.kind === "building")
  //     .slice(0, 3);
  // }, [boxes]);

  return (
    <group name={`block-lod-${blockId}`}>
      <Suspense fallback={null}>
        <JoinedBlockGLB blockId={blockId} />
        {/* {firstThreeBuildings.map((box) => (
          <DetailedBuildingLOD
            key={`detail-${box.id}`}
            blockId={blockId}
            box={box}
          />
        ))} */}
      </Suspense>
    </group>
  );
}