import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Mesh,
  type Object3D,
} from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { cityMaterialScene } from "../cityMaterials";
import type { LayoutObject } from "../../worldBuilder/document/layoutDocument";
import { RoadModel } from "../../worldBuilder/roads/RoadMeshes";
import { roadAsset, newRoad } from "../../worldBuilder/roads/roadCatalog";

// Draw the stored asphalt over the authored surface. Layout physics still
// uses its existing flat footprint and never needs a snapshot of visual LODs.
export function HarborStreet({ item }: { item: LayoutObject }) {
  const alongX = item.size[0] > item.size[2],
    width = alongX ? item.size[2] : item.size[0];
  const length = alongX ? item.size[0] : item.size[2],
    asset = roadAsset(width >= 12 ? "road_wide" : "road_narrow")!;
  const count = Math.max(1, Math.ceil(length / 115));
  const visual = useMemo(() => {
    const road = newRoad(asset);
    road.variant.left = false;
    road.variant.right = false;
    return { ...item, road };
  }, [item, asset]);
  const asphaltWidth = asset.surface.max[0] - asset.surface.min[0],
    asphaltLength = asset.surface.max[2] - asset.surface.min[2];
  return (
    <group scale={[1 / item.size[0], 1 / item.size[1], 1 / item.size[2]]}>
      <group
        position={[0, item.size[1], 0]}
        rotation={[0, alongX ? Math.PI / 2 : 0, 0]}
      >
        {Array.from({ length: count }, (_, i) => (
          <group
            key={i}
            position={[0, 0, ((i + 0.5) * length) / count - length / 2]}
            scale={[
              (width * asset.size[0]) / asphaltWidth,
              asset.size[1],
              ((length / count) * asset.size[2]) / asphaltLength,
            ]}
          >
            <RoadModel item={visual} />
          </group>
        ))}
      </group>
    </group>
  );
}
type Part = { mesh: Mesh; local: Matrix4 };
const variantsCache = new WeakMap<Object3D, Part[][]>();
function variantsFor(source: Object3D) {
  const cached = variantsCache.get(source);
  if (cached) return cached;
  const scene = cityMaterialScene(source, true);
  scene.updateWorldMatrix(true, true);
  const result = [1, 4, 7, 9].map((n) => {
    const part = scene.getObjectByName("dock_facade_" + n);
    if (!part) throw Error("Missing baked harbor facade " + n);
    const draws: Part[] = [];
    part.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) draws.push({ mesh, local: mesh.matrixWorld.clone() });
    });
    return draws;
  });
  variantsCache.set(source, result);
  return result;
}
function variant(id: string, count: number) {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n % count;
}
function Batch({
  part,
  items,
  onSelect,
}: {
  part: Part;
  items: LayoutObject[];
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const batch = ref.current;
    if (!batch) return;
    const pos = new Vector3(),
      scale = new Vector3(),
      rot = new Quaternion(),
      axis = new Vector3(0, 1, 0),
      world = new Matrix4();
    items.forEach((item, i) => {
      world.compose(
        pos.fromArray(item.position),
        rot.setFromAxisAngle(axis, (item.yaw * Math.PI) / 180),
        scale.fromArray(item.size),
      );
      batch.setMatrixAt(i, world.multiply(part.local));
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
  }, [part, items]);
  return (
    <instancedMesh
      ref={ref}
      args={[part.mesh.geometry, part.mesh.material, items.length]}
      dispose={null}
      receiveShadow
      onClick={
        onSelect
          ? (e) => {
              if (e.button === 0 && e.delta < 5 && e.instanceId !== undefined) {
                e.stopPropagation();
                onSelect(items[e.instanceId].id);
              }
            }
          : undefined
      }
    />
  );
}
function CityBuildings({
  items,
  onSelect,
}: {
  items: LayoutObject[];
  onSelect?: (id: string) => void;
}) {
  const { scene } = useGLTF(
    "/models/harbor-generated/dock-facades.glb",
    "/draco/",
  );
  const variants = useMemo(() => variantsFor(scene), [scene]);
  const groups = useMemo(
    () =>
      variants.map((_, i) =>
        items.filter((o) => variant(o.id, variants.length) === i),
      ),
    [items, variants],
  );
  return (
    <>
      {variants.map(
        (parts, i) =>
          groups[i].length > 0 &&
          parts.map((part, j) => (
            <Batch
              key={i + "-" + j}
              part={part}
              items={groups[i]}
              onSelect={onSelect}
            />
          )),
      )}
    </>
  );
}
export function HarborBuildings({
  items,
  onSelect,
  fallback,
}: {
  items: LayoutObject[];
  onSelect?: (id: string) => void;
  fallback: ReactNode;
}) {
  if (!items.length) return null;
  return (
    <AssetBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CityBuildings items={items} onSelect={onSelect} />
      </Suspense>
    </AssetBoundary>
  );
}

// The far tier shares the authored silhouettes in one instanced draw. A small
// hysteresis band avoids rebuilding material batches at the range boundary.
export function HarborBuildingLods({
  items,
  onSelect,
  renderProxy,
}: {
  items: LayoutObject[];
  onSelect?: (id: string) => void;
  renderProxy: (items: LayoutObject[]) => ReactNode;
}) {
  const [near, setNear] = useState<Set<string>>(() => new Set());
  const previous = useRef(near),
    nextSample = useRef(0);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime < nextSample.current) return;
    nextSample.current = clock.elapsedTime + 0.25;
    const visible = new Set<string>();
    for (const item of items) {
      const [x, y, z] = item.position;
      const limit = previous.current.has(item.id) ? 180 : 160;
      if (
        (camera.position.x - x) ** 2 +
          (camera.position.y - y - item.size[1] / 2) ** 2 +
          (camera.position.z - z) ** 2 <
        limit ** 2
      )
        visible.add(item.id);
    }
    if (
      visible.size === previous.current.size &&
      [...visible].every((id) => previous.current.has(id))
    )
      return;
    previous.current = visible;
    setNear(visible);
  });
  const close = useMemo(
    () => items.filter((i) => near.has(i.id)),
    [items, near],
  );
  const far = useMemo(
    () => items.filter((i) => !near.has(i.id)),
    [items, near],
  );
  return (
    <>
      {renderProxy(far)}
      <HarborBuildings
        items={close}
        onSelect={onSelect}
        fallback={renderProxy(close)}
      />
    </>
  );
}
