import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Frustum, Matrix4, Vector3, type Object3D } from "three";
import type { MapSnapshot, VisualAsset } from "../store/worldStore";
import { useNetworkStore } from "../store/networkStore";
import { useGameStore } from "../store/gameStore";
import { useRenderSettingsStore, type RenderSettings } from "../store/renderSettingsStore";
import { AssetBoundary } from "../components/debugger/AssetBoundary";
import { CityChunk } from "./CityChunk";
import { CityProxy } from "./CityProxy";
import { cityAssetVisible, cityChunkKey, detailedCityChunks, cityTextureAsset, type CityPlacement } from "./cityLod";
import { createCityInstances, supportsCityInstancing } from "./cityInstances";
import { prepareCityGpu } from "./prepareCityGpu";
import { beginCityPreparation, setCityDetailCounts } from "./cityWorkQueue";
import { cityBlocks, cityBlockLevels, cityBlockAsset, cityBlockName, cityBlockKey, CITY_REDUCED_ASSET } from "./cityBlocks";
import { collectCityShadowFrusta } from "./cityShadows";

// Drei attaches its shared Draco loader after extendLoader returns.
const cityLoader = (loader: { dracoLoader?: { setWorkerLimit: (limit: number) => unknown } | null }) => {
  queueMicrotask(() => loader.dracoLoader?.setWorkerLimit(2));
};
export function CityReflectionEnvironment() {
  // Local generated night highlights instead of a network HDRI on first entry.
  return <Environment resolution={64} frames={1}>
    <Lightformer intensity={0.75} color="#8299c2" position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 12, 1]} />
    <Lightformer intensity={0.4} color="#c3d1e8" position={[6, 3, -4]} scale={[4, 6, 1]} />
  </Environment>;
}

export function CityStreaming({ map, settings }: { map: MapSnapshot; settings: RenderSettings }) {
  const camera = useThree(s => s.camera);
  const blocks = useMemo(() => cityBlocks(map), [map]);
  const [detail, setDetail] = useState(() => ({
    chunks: detailedCityChunks(map, camera.position.x, camera.position.z, settings.cityQuality, [], undefined, settings.cityViewDistance),
    blocks: cityBlockLevels(blocks, camera.position.x, camera.position.z, settings.cityQuality, {}, settings.cityViewDistance),
  }));
  const previous = useRef(detail), lastCheck = useRef(-Infinity);
  const previousDistance = useRef(settings.cityViewDistance);
  const direction = useMemo(() => new Vector3(), []);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const onReady = useCallback((id: string, value: boolean) => setReady(current => current[id] === value ? current : { ...current, [id]: value }), []);
  useFrame(({ clock }) => {
    const rangeChanged = previousDistance.current !== settings.cityViewDistance;
    if (!rangeChanged && clock.elapsedTime - lastCheck.current < 0.1) return;
    lastCheck.current = clock.elapsedTime; previousDistance.current = settings.cityViewDistance;
    const me = useNetworkStore.getState().getMe();
    const position = !useGameStore.getState().editor && me ? me.position : [camera.position.x, camera.position.y, camera.position.z];
    camera.getWorldDirection(direction);
    const next = {
      chunks: detailedCityChunks(map, position[0], position[2], settings.cityQuality, rangeChanged ? [] : previous.current.chunks, [direction.x, direction.z], settings.cityViewDistance),
      blocks: cityBlockLevels(blocks, position[0], position[2], settings.cityQuality, rangeChanged ? {} : previous.current.blocks, settings.cityViewDistance),
    };
    if (JSON.stringify(next) !== JSON.stringify(previous.current)) { previous.current = next; setDetail(next); }
  }, -2);
  const plans = useMemo(() => map.visuals.map(visual => {
    const blockLod = blocks.length > 0 && cityBlockAsset(visual.asset);
    const placements = map.chunks.flatMap(chunk => {
      if (!cityAssetVisible(chunk, visual, settings.environmentMode, settings.chunkOverrides, settings.assetGlbs)) return [];
      const local = blocks.filter(block => block.chunk === cityChunkKey(chunk));
      if (blockLod) {
        if (local.length && !local.some(block => detail.blocks[block.key] !== "proxy")) return [];
        return [{ chunk, visual, blocks: Object.fromEntries(local.map(block => [block.name, detail.blocks[block.key]])) }];
      }
      return visual.id === "roads" || detail.chunks.includes(cityChunkKey(chunk)) || !map.collider_chunks?.find(c => c.x === chunk.x && c.z === chunk.z)?.boxes.some(box => box.kind === "building")
        ? [{ chunk, visual }] : [];
    });
    return { visual, blockLod, placements };
  }), [map, blocks, settings.environmentMode, settings.chunkOverrides, settings.assetGlbs, detail]);
  const wantsReduced = plans.some(plan => plan.blockLod && plan.placements.length > 0);
  useEffect(() => {
    if (wantsReduced) useGLTF.preload(CITY_REDUCED_ASSET, "/draco/", true, cityLoader);
  }, [wantsReduced]);
  const proxyBoxes = useMemo(() => (map.collider_chunks ?? []).flatMap(chunk => {
    const instance = map.chunks.find(c => c.x === chunk.x && c.z === chunk.z); if (!instance) return [];
    const buildingPlans = plans.filter(plan => plan.visual.id !== "roads" && cityAssetVisible(instance, plan.visual, settings.environmentMode, settings.chunkOverrides, settings.assetGlbs));
    const roads = plans.some(plan => plan.visual.id === "roads" && !ready[plan.visual.id]
      && cityAssetVisible(instance, plan.visual, settings.environmentMode, settings.chunkOverrides, settings.assetGlbs));
    return chunk.boxes.filter(box => box.kind !== "building" ? roads : buildingPlans.some(plan => {
      if (!ready[plan.visual.id]) return true;
      const name = cityBlockName(box.id);
      return plan.blockLod && name ? detail.blocks[cityBlockKey(chunk.x, chunk.z, name)] === "proxy" : !detail.chunks.includes(cityChunkKey(instance));
    }));
  }), [map, plans, ready, detail, settings.environmentMode, settings.chunkOverrides, settings.assetGlbs]);
  useEffect(() => {
    const full = map.chunks.filter(chunk => plans.some(plan => plan.visual.id !== "roads" && ready[plan.visual.id] && plan.placements.some(p => p.chunk === chunk))).length;
    const proxy = (map.collider_chunks ?? []).filter(chunk => chunk.boxes.some(box => proxyBoxes.includes(box))).length;
    setCityDetailCounts(full, proxy);
    return () => setCityDetailCounts(0, 0);
  }, [map, plans, proxyBoxes, ready]);
  return <>
    <CityProxy boxes={proxyBoxes} shadows={settings.shadows} />
    {plans.filter(plan => plan.placements.length).map(plan => <AssetBoundary key={`${plan.visual.id}/${plan.visual.asset}/${settings.cityQuality}/${settings.shadows}/${settings.reflections}/${map.chunks.length}/${plan.blockLod}`} fallback={null}>
      <Suspense fallback={null}><CityAssetInstances visual={plan.visual} placements={plan.placements} capacity={map.chunks.length}
        fast={settings.cityQuality === "fast"} onReady={onReady} blockLod={plan.blockLod} /></Suspense>
    </AssetBoundary>)}
  </>;
}

type AssetProps = { visual: VisualAsset; placements: CityPlacement[]; capacity: number; fast: boolean; onReady: (id: string, value: boolean) => void };
function CityAssetInstances({ blockLod, ...props }: AssetProps & { blockLod: boolean }) {
  const { visual, fast } = props;
  const path = cityTextureAsset(visual.asset, fast ? "fast" : "balanced");
  const { scene: source } = useGLTF(path, "/draco/", true, cityLoader);
  return blockLod ? <AssetBoundary fallback={<PreparedCityAsset source={source} {...props} />}>
    <ReducedCityAsset source={source} {...props} />
  </AssetBoundary> : <PreparedCityAsset source={source} {...props} />;
}
function ReducedCityAsset(props: AssetProps & { source: Object3D }) {
  const { scene: reducedSource } = useGLTF(CITY_REDUCED_ASSET, "/draco/", true, cityLoader);
  return <PreparedCityAsset reducedSource={reducedSource} {...props} />;
}
function PreparedCityAsset({ source, reducedSource, visual, placements, capacity, fast, onReady }: AssetProps & { source: Object3D; reducedSource?: Object3D }) {
  const gl = useThree(s => s.gl), camera = useThree(s => s.camera), scene = useThree(s => s.scene);
  const get = useThree(s => s.get);
  const shadows = useRenderSettingsStore(s => s.shadows);
  const [asset, setAsset] = useState<ReturnType<typeof createCityInstances>>(null);
  const supported = useMemo(() => supportsCityInstancing(source), [source]);
  const frustum = useMemo(() => new Frustum(), []), projection = useMemo(() => new Matrix4(), []);
  const shadowFrusta = useMemo(() => [] as Frustum[], []);
  useEffect(() => {
    const abort = new AbortController(), progress = beginCityPreparation(visual.id);
    const prepared = createCityInstances(source, capacity, fast, reducedSource, {
      multiDraw: gl.extensions.has("WEBGL_multi_draw"), castShadow: visual.id !== "roads",
    }); let completed = false, failed = false;
    onReady(visual.id, false);
    if (!prepared) { onReady(visual.id, true); progress.end(); return () => onReady(visual.id, false); }
    void prepareCityGpu(prepared, gl, get().camera, scene, abort.signal, progress.phase, shadows).then(() => {
      if (!abort.signal.aborted) { completed = true; setAsset(prepared); onReady(visual.id, true); }
    }).catch(reason => { if (!abort.signal.aborted) { failed = true; progress.phase("preparation failed; reload"); console.warn("City preparation failed", reason); } })
      .finally(() => { if (!failed) progress.end(); if (!completed) prepared.dispose(); });
    return () => { abort.abort(); progress.end(); onReady(visual.id, false); if (completed) prepared.dispose(); };
  }, [source, reducedSource, capacity, fast, gl, get, scene, visual.id, onReady, shadows]);
  useFrame(() => {
    if (!asset) return;
    camera.updateMatrixWorld(); projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projection);
    asset.group.updateWorldMatrix(true, false);
    asset.update(placements, frustum, shadows, shadows ? collectCityShadowFrusta(scene, shadowFrusta) : undefined);
  }, 0);
  if (!supported) return <>{placements.map(({ chunk, visual }) => <group key={cityChunkKey(chunk)} position={chunk.origin}>
    <CityChunk path={visual.asset} position={visual.position} quaternion={visual.rotation} scale={visual.scale} />
  </group>)}</>;
  return asset ? <primitive object={asset.group} dispose={null} /> : null;
}
