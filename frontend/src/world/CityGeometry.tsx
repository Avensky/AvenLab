import { Suspense,
    //  useLayoutEffect, 
     useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
// import { InstancedMesh, Object3D } from "three";
import { CityChunk } from "./CityChunk";

// The Blender assets were authored in centimeter-like units. Render them at
// 1/100 scale so one Three.js world unit remains approximately one meter.
const CITY_ASSET_SCALE = 0.004;
export const CITY_CHUNK_SIZE = 900;

const REAL_BLOCKS_CHUNK_ID = "chunck_0,0_2x2_blocks_centered";
const REAL_ROADS_CHUNK_ID = "chunck_0,0_2x2_roads";
const STREAM_RADIUS = 2;
// const BLOCKS_PER_SIDE = 2;
// const ROAD_GAP = 12;
// const PLACEHOLDER_HEIGHT = 24;

type ChunkCoordinate = {
  x: number;
  z: number;
};

// type PlaceholderInstancesProps = {
//   chunks: ChunkCoordinate[];
// };

function chunkKey(chunk: ChunkCoordinate) {
  return `${chunk.x},${chunk.z}`;
}

// function PlaceholderInstances({ chunks }: PlaceholderInstancesProps) {
//   const meshRef = useRef<InstancedMesh>(null);
//   const blockSize =
//     (CITY_CHUNK_SIZE - ROAD_GAP * (BLOCKS_PER_SIDE + 1)) / BLOCKS_PER_SIDE;
//   const instanceCount = chunks.length * BLOCKS_PER_SIDE * BLOCKS_PER_SIDE;

//   useLayoutEffect(() => {
//     const mesh = meshRef.current;
//     if (!mesh) return;

//     const transform = new Object3D();
//     let instanceIndex = 0;

//     for (const chunk of chunks) {
//       const chunkOriginX = chunk.x * CITY_CHUNK_SIZE;
//       const chunkOriginZ = chunk.z * CITY_CHUNK_SIZE;

//       for (let row = 0; row < BLOCKS_PER_SIDE; row += 1) {
//         for (let column = 0; column < BLOCKS_PER_SIDE; column += 1) {
//           transform.position.set(
//             chunkOriginX + ROAD_GAP + blockSize / 2 + column * (blockSize + ROAD_GAP),
//             PLACEHOLDER_HEIGHT / 2,
//             chunkOriginZ + ROAD_GAP + blockSize / 2 + row * (blockSize + ROAD_GAP)
//           );
//           transform.updateMatrix();
//           mesh.setMatrixAt(instanceIndex, transform.matrix);
//           instanceIndex += 1;
//         }
//       }
//     }

//     mesh.instanceMatrix.needsUpdate = true;
//     mesh.computeBoundingSphere();
//   }, [blockSize, chunks]);

//   if (instanceCount === 0) return null;

//   return (
//     <instancedMesh
//       ref={meshRef}
//       args={[undefined, undefined, instanceCount]}
//       name="city-placeholder-blocks"
//     >
//       <boxGeometry args={[blockSize, PLACEHOLDER_HEIGHT, blockSize]} />
//       <meshStandardMaterial color="#4b5563" roughness={0.92} metalness={0.02} />
//     </instancedMesh>
//   );
// }

// function LoadingChunkPlaceholder() {
//   const blockSize =
//     (CITY_CHUNK_SIZE - ROAD_GAP * (BLOCKS_PER_SIDE + 1)) / BLOCKS_PER_SIDE;
//   const blocks = [0, 1].flatMap((row) =>
//     [0, 1].map((column) => ({ row, column }))
//   );

//   return (
//     <group name="city-chunk-loading-placeholder">
//       {blocks.map(({ row, column }) => (
//         <mesh
//           key={`${row}-${column}`}
//           position={[
//             ROAD_GAP + blockSize / 2 + column * (blockSize + ROAD_GAP),
//             PLACEHOLDER_HEIGHT / 2,
//             ROAD_GAP + blockSize / 2 + row * (blockSize + ROAD_GAP),
//           ]}
//         >
//           <boxGeometry args={[blockSize, PLACEHOLDER_HEIGHT, blockSize]} />
//           <meshStandardMaterial color="#374151" roughness={0.95} />
//         </mesh>
//       ))}
//     </group>
//   );
// }

export function CityGeometry() {
  const camera = useThree((state) => state.camera);
  const [activeChunk, setActiveChunk] = useState<ChunkCoordinate>({ x: 0, z: 0 });
  const activeChunkRef = useRef("0,0");

  useFrame(() => {
    // The city begins at the southwest corner and grows in positive X/Z.
    const nextChunk = {
      x: Math.max(0, Math.floor(camera.position.x / CITY_CHUNK_SIZE)),
      z: Math.max(0, Math.floor(camera.position.z / CITY_CHUNK_SIZE)),
    };
    const nextKey = chunkKey(nextChunk);

    if (nextKey !== activeChunkRef.current) {
      activeChunkRef.current = nextKey;
      setActiveChunk(nextChunk);
    }
  });

  const visibleChunks = useMemo(() => {
    const chunks: ChunkCoordinate[] = [];
    const minimumX = Math.max(0, activeChunk.x - STREAM_RADIUS);
    const minimumZ = Math.max(0, activeChunk.z - STREAM_RADIUS);

    for (let z = minimumZ; z <= activeChunk.z + STREAM_RADIUS; z += 1) {
      for (let x = minimumX; x <= activeChunk.x + STREAM_RADIUS; x += 1) {
        chunks.push({ x, z });
      }
    }

    return chunks;
  }, [activeChunk]);

  const realChunkIsVisible = visibleChunks.some(
    (chunk) => chunk.x === 0 && chunk.z === 0
  );
//   const placeholderChunks = visibleChunks.filter(
//     (chunk) => chunk.x !== 0 || chunk.z !== 0
//   );

  return (
    <group name="streamed-city-geometry">
      {/* <PlaceholderInstances chunks={placeholderChunks} /> */}

      {realChunkIsVisible && (
        <Suspense 
            // fallback={<LoadingChunkPlaceholder />}
        >
          <group
            name="city-chunk-0,0-high-detail"
            scale={CITY_ASSET_SCALE}
          >
            <CityChunk chunkId={REAL_BLOCKS_CHUNK_ID} />
            <CityChunk 
                chunkId={REAL_ROADS_CHUNK_ID} 
                position={[0, 32, 0]}
            />
          </group>
        </Suspense>
      )}
    </group>
  );
}
