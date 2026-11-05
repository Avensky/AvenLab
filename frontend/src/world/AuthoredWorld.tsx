import {HarborDebris} from './props/HarborDebris';
import { useMotionView } from "../store/session/networkViews";
import {useMemo} from "react";

import { LayoutInstances } from "../worldBuilder/scene/LayoutMeshes";
import type { WorldLayout } from "../worldBuilder/document/layoutDocument";
import type { RenderMode } from "../store/world/worldStore";

// The server snapshot owns installed content. Browser drafts never enter here.
export function AuthoredWorld({
  layout,
  mode,
  cell,
  surface,
}: {
  layout: WorldLayout;
  mode: RenderMode | "hidden";
  cell: [number, number];
  surface: number;
}) {
  const destroyed=useMotionView(s=>Object.entries(s.snapshot?.asset_health??{}).filter(([,hp])=>hp===0).map(([id])=>id).sort().join("|"));
  const objects=useMemo(()=>{const ids=new Set(destroyed.split("|"));return layout.objects.filter(o=>!ids.has(o.id));},[layout, destroyed]);
  if (mode === "hidden") return null;
  return (
    <group name="authored-world">
      {layout.base === "replace" &&
        layout.ground !== false &&
        mode !== "collider" && (
          <mesh position={[0, surface - 0.25, 0]}>
            <boxGeometry args={[cell[0], 0.5, cell[1]]} />
            <meshStandardMaterial color="#142d40" roughness={1} />
          </mesh>
        )}
      <HarborDebris layout={layout} destroyed={destroyed}/>
      <LayoutInstances live
        objects={objects}
        wireframe={mode === "collider"}
        collisionOnly={mode === "collider" || mode === "geometry"}
      />
      {mode === "hybrid" && (
        <LayoutInstances live objects={objects} wireframe collisionOnly />
      )}
    </group>
  );
}
