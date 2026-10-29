import { Suspense } from "react";
import { Environment, Stars } from "@react-three/drei";
import { useWorldStore } from "../store/worldStore";
import { useNetworkStore } from "../store/networkStore";
import { assetKey, chunkKey, useRenderSettingsStore } from "../store/renderSettingsStore";
import { DebugFlags, hasDebugFlag } from "../store/tools/debugMasks";
import { DebugColliders } from "../components/debugger/DebugColliders";
import { CityChunk } from "./CityChunk";
import { AssetBoundary } from "../components/debugger/AssetBoundary";
import { CityStreaming, CityReflectionEnvironment } from "./CityStreaming";
import {AuthoredWorld} from './AuthoredWorld';

export function CityScene() {
  const map = useWorldStore((s) => s.map);
  const debugMask = useWorldStore((s) => s.debugMask);
  const settings = useRenderSettingsStore();
  const streamed = settings.cityQuality !== "original" && Boolean(map?.collider_chunks);
  // Only the explicit diagnostics switch subscribes to per-tick block data.
  return <group name="city-scene">
    <color attach="background" args={["#02040a"]} />
    {settings.stars && <Stars radius={500} depth={80} count={1200} factor={3} saturation={0.1} fade speed={0.15} />}
    {settings.fog && <fog attach="fog" args={["#050914", 250, 1100]} />}
    {settings.reflections && <AssetBoundary fallback={null}><Suspense fallback={null}>{streamed ? <CityReflectionEnvironment /> : <Environment preset="night" background={false} />}</Suspense></AssetBoundary>}
    <hemisphereLight args={["#526889", "#08090c", 0.45]} />
    <directionalLight color="#9fbfff" intensity={1.8} position={[-120, 180, -80]} castShadow={settings.shadows} />
    {map?.chunks.map((chunk) => {
      const key = chunkKey(chunk.x, chunk.z);
      const mode = settings.chunkOverrides[key] ?? settings.environmentMode;
      const boxes = map.collider_chunks?.find((c) => c.x === chunk.x && c.z === chunk.z)?.boxes ?? [];
      return <group key={key} name={`city-chunk-${key}`}>
        {map.authored_layout && <group position={chunk.origin}><AuthoredWorld layout={map.authored_layout} mode={mode} cell={map.cell} surface={map.surface.road_y}/></group>}
        {(mode === "collider" || mode === "geometry" || mode === "hybrid") &&
          <DebugColliders boxes={boxes} solid={mode === "geometry"} />}
        {map.visuals.map((visual) => {
          if (streamed) return null;
          const show = settings.assetGlbs[assetKey(chunk.x, chunk.z, visual.id)] ?? (mode === "glb" || mode === "hybrid");
          if (!show) return null;
          return <AssetBoundary key={visual.id} fallback={<DebugColliders boxes={boxes} />}>
            <Suspense fallback={<DebugColliders boxes={boxes} />}>
              <group position={chunk.origin}>
                <CityChunk path={visual.asset} position={visual.position} quaternion={visual.rotation} scale={visual.scale} />
              </group>
            </Suspense>
          </AssetBoundary>;
        })}
      </group>;
    })}
    {streamed && map && <CityStreaming key={`${map.map_id}/${settings.cityQuality}`} map={map} settings={settings} />}
    {hasDebugFlag(debugMask, DebugFlags.BLOCKS) && <BlockDiagnostics />}
  </group>;
}
function BlockDiagnostics() {
  const boxes = useNetworkStore((s) => s.debugOverlay?.block_boxes);
  return boxes ? <DebugColliders boxes={boxes} /> : null;
}
