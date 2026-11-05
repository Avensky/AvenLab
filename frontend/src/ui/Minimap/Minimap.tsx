import { useMotionView } from "../../store/session/networkViews";
import {useRenderSettingsStore} from '../../store/presentation/renderSettingsStore';
import {HarborChart,harborRoads,isHarbor} from "./HarborChart";
import {MapPlayerMarkers} from "./MapPlayerMarkers";
import { useHudPanelsStore } from "../../store/hud/hudPanelsStore";
import { useMapTelemetryStore } from "../../store/telemetry";
import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useWorldStore } from "../../store/world/worldStore";
import { startVehicleTelemetry } from "../../store/telemetry/vehicleTelemetryStore";
import { useNavigationStore } from "../../store/world/navigationStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useUIStore } from "../../store/menus/uiStore";
import { MatchClock } from "../Cockpit/CabinClock";
import {
  buildRoadGraph,
  nearestRoad,
  roadRoute,
  pathDistance,
} from "../../navigation/roadNavigation";
import {type DebugAabbBox} from "../../store/session/networkStore";

const RoadLayer = memo(function RoadLayer({
  roads,
}: {
  roads: ReturnType<typeof buildRoadGraph>["roads"];
}) {
  return (
    <>
      {roads.map((r, i) => (
        <rect
          key={i}
          x={r.x - r.hx}
          y={r.z - r.hz}
          width={r.hx * 2}
          height={r.hz * 2}
          fill="var(--gps-road, #293e4b)"
          stroke="var(--gps-road-edge, #59717f)"
          strokeWidth="1"
        />
      ))}
    </>
  );
});
// The city uses a shared road slab per chunk. Its actual building footprints
// supply the cross streets and blocks at minimap scale.
const BlockLayer = memo(function BlockLayer({ boxes, x, z, radius }: {
  boxes: DebugAabbBox[]; x: number; z: number; radius: number;
}) {
  return <g className="gps-blocks" aria-hidden="true">{boxes.map(box => {
    const [bx, , bz] = box.center, [hx, , hz] = box.half_extents;
    if (Math.abs(bx - x) > radius + hx || Math.abs(bz - z) > radius + hz) return null;
    return <rect key={`${box.id}/${bx}/${bz}`} x={bx - hx} y={bz - hz} width={hx * 2} height={hz * 2}
      fill="#263138" stroke="#627075" strokeWidth=".5" vectorEffect="non-scaling-stroke" />;
  })}</g>;
});
const MissionReadout = memo(function MissionReadout() {
  const mission = useNavigationStore((s) => s.mission),
    hasDestination = useNavigationStore((s) => s.destination !== null),
    sandbox = useUIStore((s) => s.screen === "sandbox");
  const match = useMotionView(s => Boolean(s.snapshot?.match_state));
  if (match && !mission && !hasDestination) return null;
  const title = mission?.title ?? (sandbox ? "SANDBOX" : "NAVIGATION"),
    objective =
      mission?.objective ??
      (hasDestination ? "REACH GPS DESTINATION" : "FREE DRIVE");
  const content = (
    <>
      <strong>{title}</strong>
      <span>{objective}</span>
    </>
  );
  return (
    <div className="map-mission" aria-label="Mission information">
      {mission?.target ? (
        <button
          type="button"
          aria-label="Navigate to mission objective"
          title={`${title}: ${objective}`}
          onClick={() =>
            useNavigationStore.getState().setDestination(mission.target)
          }
        >
          {content}
        </button>
      ) : (
        <div title={`${title}: ${objective}`}>{content}</div>
      )}
    </div>
  );
});
function MapContent({ circular = false }: { circular?: boolean }) {
  useEffect(startVehicleTelemetry, []);
  const map = useWorldStore((s) => s.map),
    x = useMapTelemetryStore((s) => s.x),
    z = useMapTelemetryStore((s) => s.z),
    yaw = useMapTelemetryStore((s) => s.yaw),
    mile = usePreferencesStore((s) => s.speedUnit === "mph");
  const destination = useNavigationStore((s) => s.destination),
    set = useNavigationStore.getState().setDestination,
    [range, setRange] = useState(!circular && isHarbor(map?.map_id)?850:600),
    [notice, setNotice] = useState("");
  const objective = useNavigationStore((s) => s.mission?.target);
  const modern = usePreferencesStore(s => s.hudGroups.futuristic);
  const harbor = isHarbor(map?.map_id)?map?.authored_layout:undefined;
  const bridgeId=useMemo(()=>harbor?.objects.find(o=>o.piece==="canal-breakable")?.id,[harbor]);
  const collapsed=useMotionView(s=>!!bridgeId && s.snapshot?.asset_health?.[bridgeId]===0);
  const boxes = useMemo(() => harbor ? harborRoads(harbor,collapsed) : (map?.collider_chunks ?? []).flatMap(chunk => chunk.boxes), [map,harbor,collapsed]);
  const graph = useMemo(() => buildRoadGraph(boxes), [boxes]);
  const lowDetail = useRenderSettingsStore(s => s.lowDetail);
  const showBuildings=modern && circular && !lowDetail;
  const buildings = useMemo(() => showBuildings ? boxes.filter(box => box.kind === "building") : [], [boxes,showBuildings]);
  const navigating = destination !== null;
  const start = useMemo(
    () => navigating && x !== null && z !== null ? nearestRoad(graph, { x, z }) : null,
    [graph, navigating, x, z],
  );
  const end = useMemo(() => destination ? nearestRoad(graph, destination) : null, [graph, destination]);
  const si = start?.index ?? -1,
    ei = end?.index ?? -1;
  const middle = useMemo(() => roadRoute(graph, si, ei), [graph, si, ei]);
  const route = useMemo(() => {
    if (!start || !end || !middle || start.distance > 80 || end.distance > 80) return null;
    const points = [start.point, ...middle, end.point];
    return { points: points.map(p => `${p.x},${p.z}`).join(" "), metres: pathDistance(points) };
  }, [start, end, middle]);
  const metres = route?.metres ?? null;
  const units =
    metres === null
      ? "NO ROUTE"
      : metres < 8
        ? "ARRIVED"
        : mile
          ? metres >= 1609
            ? `${(metres / 1609.344).toFixed(1)} MI`
            : `${Math.round(metres * 3.28084)} FT`
          : metres >= 1000
            ? `${(metres / 1000).toFixed(1)} KM`
            : `${Math.round(metres)} M`;
  const px = harbor && !circular ? 0 : x ?? 0,
    pz = harbor && !circular ? 0 : z ?? 0,
    depth = range,
    cell = range / 2,
    cx = Math.floor(px / cell),
    cz = Math.floor(pz / cell);
  const visibleRoads = useMemo(
    () =>
      graph.roads.filter(
        (r) =>
          Math.abs(r.x - (cx + 0.5) * cell) <= range + r.hx &&
          Math.abs(r.z - (cz + 0.5) * cell) <= range + r.hz,
      ),
    [graph, cx, cz, cell, range],
  );
  const idlePrompt = modern && circular && map && graph.roads.length > 0 && x !== null && !destination && !notice;
  return (
    <>
      <div className="map-viewport" data-circular={circular}>
        <svg
          className="gps-map"
          viewBox={`${px - range / 2} ${pz - depth / 2} ${range} ${depth}`}
          role="img"
          aria-label="GPS road map; click a road to set a destination"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const u = (e.clientX - r.left) / r.width,
              v = (e.clientY - r.top) / r.height;
            if (circular && (u - 0.5) ** 2 + (v - 0.5) ** 2 > 0.25) return;
            const p = nearestRoad(graph, {
              x: px - range / 2 + u * range,
              z: pz - depth / 2 + v * depth,
            });
            if (p && p.distance <= 80) {
              set(p.point);
              setNotice("");
            } else setNotice("SELECT A ROAD");
          }}
        >
          {harbor && <g fill="#41504f">{harbor.objects.filter(o=>o.piece==="coastal-land").map(o=><rect key={o.id}
             x={o.position[0]-o.size[0]/2} y={o.position[2]-o.size[2]/2} width={o.size[0]} height={o.size[2]}/>)}</g>}
          <RoadLayer roads={visibleRoads} />
          {harbor && <HarborChart layout={harbor} range={range}/>}
          {showBuildings && <BlockLayer boxes={buildings} x={(cx + .5) * cell} z={(cz + .5) * cell} radius={range} />}
          {route && (
            <polyline
              points={route.points}
              stroke="#8ee7ff"
              strokeWidth={range / 90}
              fill="none"
              strokeLinejoin="round"
            />
          )}
          {destination && (
            <circle
              cx={destination.x}
              cy={destination.z}
              r={range / 65}
              fill="#ffb75b"
            />
          )}
          {objective && (
            <g
              transform={`translate(${objective.x} ${objective.z}) scale(${range / 100})`}
              aria-label="Mission objective marker"
            >
              <path
                d="M0 -2.5 2.5 0 0 2.5-2.5 0z"
                fill="#ffce70"
                stroke="#3b2811"
                strokeWidth=".6"
              />
            </g>
          )}
          {x !== null && z !== null && <MapPlayerMarkers x={x} z={z} centerX={px} centerZ={pz} range={range} circular={circular}/> }
          {x !== null && z !== null && (
            <g
              transform={`translate(${x} ${z}) scale(${range / 170}) rotate(${180 - (yaw ?? 0)})`}
            >
              <path
                d="M0 -7L5 6 0 3-5 6z"
                fill="var(--gps-self, #e3fbff)"
                stroke="#061019"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
        <span className="map-north">N</span>
        <MissionReadout />
      </div>
      {harbor && !circular && <small className="harbor-chart-key">F · FUEL　 R · REPAIR　 DARK SECTORS · UNSURVEYED</small>}
      <div className="gps-controls">
        <button
          aria-label="GPS destination ahead"
          disabled={x === null || !graph.roads.length}
          onClick={() => {
            const a = ((yaw ?? 0) * Math.PI) / 180,
              p = nearestRoad(graph, {
                x: px + Math.sin(a) * 250,
                z: pz + Math.cos(a) * 250,
              });
            if (p) set(p.point);
          }}
        >
          {circular ? "⌖" : "GPS"}
        </button>
        <button aria-label="Clear GPS destination" onClick={() => set(null)}>
          {circular ? "×" : "CLEAR"}
        </button>
        <button
          aria-label="Map zoom in"
          onClick={() => setRange(Math.max(150, range / 2))}
        >
          +
        </button>
        <button
          aria-label="Map zoom out"
          onClick={() => setRange(Math.min(1600, range * 2))}
        >
          −
        </button>
      </div>
      {!idlePrompt && <output className="gps-status">
        {notice ||
          (!map
            ? "MAP UNAVAILABLE"
            : !graph.roads.length
              ? "ROAD DATA UNAVAILABLE"
              : x === null
                ? "GPS UNAVAILABLE"
                : destination
                  ? units
                  : "SELECT DESTINATION")}
      </output>}
    </>
  );
}
export const Minimap = memo(function Minimap({
  forceExpanded = false,
}: {
  forceExpanded?: boolean;
}) {
  const visible = usePreferencesStore((s) => s.hudGroups.minimap);
  const expanded = useHudPanelsStore((s) => s.map);
  const scale = usePreferencesStore((s) => s.minimapScale);
  const open = forceExpanded || expanded;
  if (!visible && !forceExpanded) return null;
  return (
    <section
      className={`hud-minimap ${forceExpanded ? "map-full" : ""}`}
      data-hud-group="minimap"
      data-expanded={open}
      style={
        forceExpanded
          ? undefined
          : ({ "--minimap-scale": scale } as CSSProperties)
      }
      aria-label="Minimap and GPS"
    >
      <div className="map-rim">
        {!forceExpanded && (
          <button
            type="button"
            className="map-toggle"
            title={open ? "Minimize map" : "Open map"}
            aria-label={open ? "Minimize map" : "Open map"}
            aria-expanded={open}
            onClick={() => useHudPanelsStore.getState().toggle("map")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              {open ? (
                <path d="M4 10h6V4M20 14h-6v6M4 4l6 6m10 10-6-6" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="m14 5 2 10-10 3 8-13Z" />
                </>
              )}
            </svg>
          </button>
        )}
        <MatchClock />
      </div>
      {open && <MapContent circular={!forceExpanded} />}
    </section>
  );
});
