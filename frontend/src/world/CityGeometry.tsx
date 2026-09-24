
import { useWorldStore } from "../store";
import { CityChunk } from "./CityChunk";
import type {
  LoadedChunkInstance,
  VisualAsset,
} from "../store/worldStore";

function CityChunkInstance({
  chunk,
  visuals,
}: {
  chunk: LoadedChunkInstance;
  visuals: VisualAsset[];
}) {
  return (
    <group position={chunk.origin}>
      {visuals.map((visual) => (
        <MapVisual
          key={visual.id}
          visual={visual}
        />
      ))}
    </group>
  );
}


function MapVisual({
  visual,
}: {
  visual: VisualAsset;
}) {
  return (
    <CityChunk
      path={visual.asset}
      position={visual.position}
      quaternion={visual.rotation}
      scale={visual.scale}
    />
  );
}


export function CityGeometry() {
  const map = useWorldStore((state) => state.map);
  console.log("CITY MAP:", map);


  if (!map) {
    return null;
  }

  return (
    <group name={`map-${map.map_id}`}>
      {map.chunks.map((chunk) => (
        <CityChunkInstance
          key={`${chunk.x},${chunk.z}`}
          chunk={chunk}
          visuals={map.visuals}
        />
      ))}
    </group>
  );
}