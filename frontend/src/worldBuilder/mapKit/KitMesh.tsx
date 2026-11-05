import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  startTransition,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DoubleSide, Group, type Mesh, MeshBasicMaterial, Vector3 } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import type { LayoutObject, V3 } from "../document/layoutDocument";
import { kitAsset, type KitAsset } from "./catalog";

function Loaded({
  asset,
  url,
  tint,
}: {
  asset: KitAsset;
  url: string;
  tint?: MeshBasicMaterial;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const source = asset.node ? scene.getObjectByName(asset.node) : scene;
    if (!source) throw Error(`Missing map piece ${asset.id} in ${url}`);
    const clone = source.clone(true);
    if (asset.node) clone.position.set(0, 0, 0);
    clone.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.receiveShadow = !tint;
        if (tint) mesh.material = tint;
      }
    });
    return clone;
  }, [scene, asset, url, tint]);
  return <primitive object={model} dispose={null} />;
}

export function KitMesh({
  item,
  asset,
  collisionOnly = false,
  wireframe = false,
  ghost = false,
  forceDetail = false,
}: {
  item: LayoutObject;
  asset: KitAsset;
  collisionOnly?: boolean;
  wireframe?: boolean;
  ghost?: boolean;
  forceDetail?: boolean;
}) {
  const group = useRef<Group>(null);
  const [level, setLevel] = useState<number | null>(null);
  const last = useRef<number | null>(null);
  const center = useMemo(
    () =>
      asset.bounds.min.map(
        (lo, i) => (lo + asset.bounds.max[i]) / (2 * asset.size[i]),
      ) as V3,
    [asset],
  );
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!group.current || forceDetail || collisionOnly) return;
    group.current.localToWorld(point.fromArray(center));
    // Measure to the module's bounding sphere to keep a long span detailed while driving on it.
    const distance = Math.max(
      0,
      point.distanceTo(camera.position) - Math.hypot(...item.size) / 2,
    );
    const previous = last.current;
    const next =
      distance < (previous === 0 ? 105 : 90)
        ? 0
        : distance < (previous === 2 ? 235 : 265)
          ? 1
          : 2;
    if (next !== previous) {
      last.current = next;
      startTransition(() => setLevel(next));
    }
  });
  const tint = useMemo(
    () =>
      collisionOnly || wireframe || ghost
        ? new MeshBasicMaterial({
            color: ghost ? "#67c5ff" : "#57d9ae",
            wireframe,
            transparent: ghost,
            opacity: ghost ? 0.45 : 1,
            side: DoubleSide,
          })
        : undefined,
    [collisionOnly, wireframe, ghost],
  );
  useEffect(() => () => tint?.dispose(), [tint]);
  const file = collisionOnly
    ? asset.collisionFile
    : forceDetail
      ? asset.lodFiles[0]
      : level === null
        ? null
        : asset.lodFiles[level];
  if (collisionOnly && !item.solid) return null;
  const fallback = (
    <mesh position={center}>
      <boxGeometry />
      <meshBasicMaterial wireframe color={item.color} />
    </mesh>
  );
  return (
    <group ref={group}>
      <AssetBoundary key={asset.id} fallback={fallback}>
        <Suspense fallback={fallback}>
          {file && (
            <group scale={asset.size.map((v) => 1 / v) as V3}>
              <Loaded asset={asset} url={`/models/roads/${file}`} tint={tint} />
            </group>
          )}
        </Suspense>
      </AssetBoundary>
    </group>
  );
}

export function KitInstances({
  objects,
  exclude,
  collisionOnly,
  wireframe,
  onSelect,
}: {
  objects: LayoutObject[];
  exclude: string | null;
  collisionOnly: boolean;
  wireframe: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      {objects.map((item) => {
        const asset = kitAsset(item.piece);
        if (!asset || item.id === exclude || (collisionOnly && !item.solid))
          return null;
        return (
          <group
            key={item.id}
            position={item.position}
            rotation={[0, (item.yaw * Math.PI) / 180, 0]}
            scale={item.size}
            onClick={
              onSelect
                ? (e) => {
                    if (e.button === 0 && e.delta < 5) {
                      e.stopPropagation();
                      onSelect(item.id);
                    }
                  }
                : undefined
            }
          >
            <KitMesh
              item={item}
              asset={asset}
              collisionOnly={collisionOnly}
              wireframe={wireframe}
            />
          </group>
        );
      })}
    </>
  );
}
