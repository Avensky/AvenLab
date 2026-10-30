import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, Group, InstancedMesh, Matrix4, Object3D, Vector3 } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { useRenderSettingsStore } from "../../store/presentation/renderSettingsStore";
import type { LayoutObject, V3 } from "../document/layoutDocument";
import { GarageGLTFLoader } from "../models/garageLoader";
import { useEditorPreferences } from "../state/editorPreferences";
import { vehicleAsset, vehicleDetailIds } from "./vehicleCatalog";
import { normalizedVehicleTemplate } from "./vehicleTemplate";

const cache = new WeakMap<Object3D, Group>();
function vehicleTemplate(scene: Group, id: string) {
  let template = cache.get(scene);
  if (!template) {
    template = normalizedVehicleTemplate(
      scene,
      id,
      vehicleAsset(id)!.sourceYaw,
    );
    cache.set(scene, template);
  }
  return template;
}
const proxyParts = [
  { pos: [0, 0.3, 0], size: [0.98, 0.34, 0.94], body: true },
  { pos: [0, 0.66, -0.025], size: [0.8, 0.4, 0.48], body: false },
  ...[-1, 1].flatMap((x) =>
    [-1, 1].map((z) => ({
      pos: [x * 0.46, 0.14, z * 0.31],
      size: [0.1, 0.28, 0.17],
      body: false,
    })),
  ),
];
function LocalProxy({
  color,
  ghost = false,
}: {
  color: string;
  ghost?: boolean;
}) {
  return (
    <group name="vehicle-proxy">
      {proxyParts.map((p, i) => (
        <mesh key={i} position={p.pos as V3} scale={p.size as V3}>
          <boxGeometry />
          <meshStandardMaterial
            color={p.body ? color : i === 1 ? "#243647" : "#16202b"}
            roughness={0.85}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      ))}
    </group>
  );
}
function VehicleVisual({ item }: { item: LayoutObject }) {
  const a = vehicleAsset(item.vehicle!.asset)!,
    gltf = useLoader(GarageGLTFLoader, a.url),
    root = useMemo(
      () => cloneSkeleton(vehicleTemplate(gltf.scene, a.id)),
      [gltf.scene, a.id],
    );
  return (
    <group name={`vehicle-full-${a.id}`} dispose={null}>
      <primitive object={root} dispose={null} />
    </group>
  );
}
export function VehicleMesh({
  item,
  ghost = false,
  collisionOnly = false,
  forceDetail = false,
}: {
  item: LayoutObject;
  ghost?: boolean;
  collisionOnly?: boolean;
  forceDetail?: boolean;
}) {
  const detail = useEditorPreferences((s) => s.detail);
  if (collisionOnly) return null;
  const proxy = <LocalProxy color={item.color} ghost={ghost} />;
  if (
    ghost ||
    item.vehicle!.lod === "proxy" ||
    (!forceDetail && detail === "low")
  )
    return proxy;
  return (
    <AssetBoundary key={item.vehicle!.asset} fallback={proxy}>
      <Suspense fallback={proxy}>
        <VehicleVisual item={item} />
      </Suspense>
    </AssetBoundary>
  );
}
function ProxyInstances({
  items,
  onSelect,
}: {
  items: LayoutObject[];
  onSelect?: (id: string) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const base = new Object3D(),
      local = new Object3D(),
      matrix = new Matrix4(),
      color = new Color();
    items.forEach((item, index) => {
      base.position.fromArray(item.position);
      base.rotation.set(0, (item.yaw * Math.PI) / 180, 0);
      base.scale.fromArray(item.size);
      base.updateMatrix();
      proxyParts.forEach((part, j) => {
        local.position.fromArray(part.pos);
        local.scale.fromArray(part.size);
        local.updateMatrix();
        matrix.multiplyMatrices(base.matrix, local.matrix);
        mesh.current!.setMatrixAt(index * proxyParts.length + j, matrix);
        mesh.current!.setColorAt(
          index * proxyParts.length + j,
          color.set(part.body ? item.color : j === 1 ? "#243647" : "#16202b"),
        );
      });
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh
      key={items.length}
      name="vehicle-proxy-instances"
      ref={mesh}
      args={[undefined, undefined, items.length * proxyParts.length]}
      onClick={
        onSelect
          ? (e) => {
              if (e.button === 0 && e.delta < 5 && e.instanceId !== undefined) {
                e.stopPropagation();
                onSelect(
                  items[Math.floor(e.instanceId / proxyParts.length)].id,
                );
              }
            }
          : undefined
      }
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}
export function VehicleInstances({
  objects,
  exclude,
  onSelect,
  collisionOnly,
}: {
  objects: LayoutObject[];
  exclude: string | null;
  onSelect?: (id: string) => void;
  collisionOnly: boolean;
}) {
  const demand = useThree((s) => s.frameloop === "demand");
  const items = useMemo(
      () => objects.filter((o) => o.vehicle && o.id !== exclude),
      [objects, exclude],
    ),
    root = useRef<Group>(null),
    frame = useRef(0),
    point = useMemo(() => new Vector3(), []);
  const detail = useEditorPreferences((s) => s.detail),
    cityQuality = useRenderSettingsStore((s) => s.cityQuality),
    [full, setFull] = useState<string[]>([]);
  useFrame(({ camera }) => {
    if (collisionOnly || !root.current || (!demand && frame.current++ % 15))
      return;
    const local = root.current.worldToLocal(camera.getWorldPosition(point)),
      next = vehicleDetailIds(
        items,
        local.toArray() as V3,
        detail,
        new Set(full),
      ).slice(0, cityQuality === "fast" && detail !== "high" ? 2 : 12);
    if (next.join("|") !== full.join("|")) setFull(next);
  });
  const proxies = useMemo(
    () => items.filter((o) => !full.includes(o.id)),
    [items, full],
  );
  if (collisionOnly) return null;
  return (
    <group ref={root} name="background-vehicles">
      <ProxyInstances items={proxies} onSelect={onSelect} />
      {items
        .filter((o) => full.includes(o.id))
        .map((item) => (
          <group
            key={item.id}
            position={item.position}
            scale={item.size}
            rotation={[0, (item.yaw * Math.PI) / 180, 0]}
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
            <VehicleMesh item={item} />
          </group>
        ))}
    </group>
  );
}
