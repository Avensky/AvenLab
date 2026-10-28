import { useProgress } from "@react-three/drei";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { useWorldStore } from "../store/worldStore";
import { useNetworkStore } from "../store/networkStore";
import { useDebugViewStore } from "../store/debugViewStore";
import { useGameStore } from "../store/gameStore";
import { useUIStore } from "../store/uiStore";
import { useVisualAlignmentStore } from "../store/visualAlignmentStore";
import type { ExperimentContext } from "./measurements";
import { playerLocation } from "./location";
import { cityStreamingStats } from "../world/cityWorkQueue";
import { resolveCityViewDistance } from "../world/cityViewDistance";
import { useVehicleConfigStore } from "../store/vehicleConfigStore";

export function experimentContext(): ExperimentContext {
  const s = useRenderSettingsStore.getState();
  const render = { cityQuality: s.cityQuality, cityViewDistance: s.cityViewDistance,
    cityViewDistanceMeters: s.cityQuality === "original" ? null : resolveCityViewDistance(s.cityQuality, s.cityViewDistance),
    environmentMode: s.environmentMode, vehicleOverrides: s.vehicleOverrides, chunkOverrides: s.chunkOverrides, assetGlbs: s.assetGlbs,
    dpr: s.dpr, shadows: s.shadows, reflections: s.reflections, stars: s.stars, fog: s.fog, vehicleLights: s.vehicleLights, hud: s.hud, overlay: s.overlay, autoVehicleAlignment: s.autoVehicleAlignment, opaqueCityMaterials: s.opaqueCityMaterials };
  const network = useNetworkStore.getState();
  const world = useWorldStore.getState();
  const ui = useUIStore.getState();
  const game = useGameStore.getState();
  const debug = useDebugViewStore.getState();
  const settings = { ...render, vehicleMode: world.mode, debugMask: world.debugMask,
    vehicleHud: useVehicleConfigStore.getState().byPlayer[network.playerId] ?? null,
    interpolation: debug.interpolationEnabled, playerScope: debug.playerScope,
    camera: game.camera, editor: game.editor, map: world.map?.map_id,
    chunks: world.map?.chunks.map((c) => [c.x, c.z]),
    visuals: world.map?.visuals, cell: world.map?.cell, coordinateSystem: world.map?.coordinate_system,
    roster: network.snapshot?.entities.map((e) => [e.id, e.vehicle_id]),
    viewport: [window.innerWidth, window.innerHeight], devicePixelRatio: window.devicePixelRatio,
    build: import.meta.env.MODE, userAgent: navigator.userAgent };
  const age = performance.now() - (network.snapshot?.received_at_ms ?? -Infinity);
  const reason = document.visibilityState !== "visible" ? "tab hidden" : ui.screen !== "sandbox" ? "enter sandbox"
    : ui.overlay !== null ? "close menus" : !network.connected || age > 500 ? "no fresh physics snapshots"
      : !world.map?.collider_chunks ? "restart the updated Rust backend"
        : useProgress.getState().errors.length > 0 ? "asset load failed; reload for a clean baseline"
          : useProgress.getState().active ? "assets loading" : cityStreamingStats().pending ? "city visuals preparing" : "";
  const me = network.snapshot?.entities.find((entity) => entity.id === network.playerId);
  return { settings: { ...settings, alignment: useVisualAlignmentStore.getState().reports,
    playerResources: me ? { fuelLiters: me.fuel, temperatureC: me.temp, condition: me.condition ?? null, boostFraction: me.boost_fraction ?? null, ultimateFraction: me.ultimate_fraction ?? null, resourceMask: me.resource_mask ?? 0 } : null,
    playerPose: me ? { position: me.position, rotation: me.rotation, speed: me.speed } : null },
    location: playerLocation(me, world.map),
    key: JSON.stringify(settings), ready: reason === "", reason };
}
