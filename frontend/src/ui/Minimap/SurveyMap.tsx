import { useEffect, useId, useMemo } from "react";
import { useUIStore } from "../../store/menus/uiStore";
import { useWorldStore } from "../../store/world/worldStore";
import { useMotionView } from "../../store/session/networkViews";
import { useMapTelemetryStore } from "../../store/telemetry";
import { startVehicleTelemetry } from "../../store/telemetry/vehicleTelemetryStore";
import { harborRoads, isHarbor } from "./HarborChart";
import { useSurvey, personalChart } from "./surveyedCells";
import type { DebugAabbBox } from "../../store/session/networkStore";
import "./surveyMap.css";

function drawBox(b: DebugAabbBox, i: number) {
  return (
    <rect
      key={b.id + "-" + i}
      x={b.center[0] - b.half_extents[0]}
      y={b.center[2] - b.half_extents[2]}
      width={b.half_extents[0] * 2}
      height={b.half_extents[2] * 2}
      fill={b.kind === "road" ? "#93a6b1" : "#45535a"}
    />
  );
}
export function SurveyMap() {
  const map = useWorldStore((s) => s.map),
    bits = useWorldStore((s) => s.sectorChart),
    stored = useSurvey((s) => s.cells);
  const x = useMapTelemetryStore((s) => s.x),
    z = useMapTelemetryStore((s) => s.z);
  const mask = useId().replaceAll(":", ""),
    harbor = isHarbor(map?.map_id) ? map?.authored_layout : undefined;
  const broken = useMemo(
    () => harbor?.objects.find((o) => o.piece === "canal-breakable")?.id,
    [harbor],
  );
  const collapsed = useMotionView(
    (s) => !!broken && s.snapshot?.asset_health?.[broken] === 0,
  );
  useEffect(startVehicleTelemetry, []);
  const cells = useMemo(
    () => personalChart(stored, harbor ? bits : undefined),
    [harbor, bits, stored],
  );
  const visited = useMemo(
    () => new Set(cells.map((cell) => cell.x + "," + cell.z)),
    [cells],
  );
  const view = useMemo(() => {
    if (harbor || !cells.length) return "-410 -410 820 820";
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const c of cells) {
      minX = Math.min(minX, c.x);
      minZ = Math.min(minZ, c.z);
      maxX = Math.max(maxX, c.x);
      maxZ = Math.max(maxZ, c.z);
    }
    return [minX - 10, minZ - 10, maxX - minX + 120, maxZ - minZ + 120].join(
      " ",
    );
  }, [harbor, cells]);
  const roads = useMemo(
    () => (harbor ? harborRoads(harbor, collapsed) : []),
    [harbor, collapsed],
  );
  return (
    <section
      className="survey-map"
      role="dialog"
      aria-modal="true"
      aria-label="Exploration map"
    >
      <header>
        <strong>{map?.authored_layout?.title ?? "Exploration map"}</strong>
        <span>{cells.length} surveyed sectors</span>
        <button autoFocus onClick={() => useUIStore.getState().closeOverlay()}>
          CLOSE · M
        </button>
      </header>
      <svg
        role="img"
        aria-label="Surveyed terrain and discovered facilities"
        viewBox={view}
      >
        <defs>
          <clipPath id={mask}>
            {cells.map((c) => (
              <rect
                key={c.x + "," + c.z}
                x={c.x}
                y={c.z}
                width="100"
                height="100"
              />
            ))}
          </clipPath>
        </defs>
        <g clipPath={"url(#" + mask + ")"}>
          {cells.map((c) => (
            <rect
              key={c.x + "," + c.z}
              x={c.x}
              y={c.z}
              width="100"
              height="100"
              fill={harbor ? "#213b49" : "#303e44"}
            />
          ))}
          {harbor?.objects
            .filter(
              (o) =>
                o.piece === "coastal-land" || o.piece === "coastal-building",
            )
            .map((o) => (
              <rect
                key={o.id}
                x={o.position[0] - o.size[0] / 2}
                y={o.position[2] - o.size[2] / 2}
                width={o.size[0]}
                height={o.size[2]}
                fill={o.piece === "coastal-land" ? "#485754" : "#758181"}
              />
            ))}
          {harbor
            ? roads.map(drawBox)
            : cells.flatMap((c) => c.boxes).map(drawBox)}
          {harbor?.objects
            .filter(
              (o) =>
                [
                  "fuel-station",
                  "repair-shop",
                  "service-center",
                  "big-e-docked",
                ].includes(o.piece) &&
                visited.has(
                  Math.floor(o.position[0] / 100) * 100 +
                    "," +
                    Math.floor(o.position[2] / 100) * 100,
                ),
            )
            .map((o) => (
              <g key={o.id}>
                <title>{o.name}</title>
                <circle
                  cx={o.position[0]}
                  cy={o.position[2]}
                  r="4"
                  fill="#efad57"
                />
                <text
                  x={o.position[0] + 6}
                  y={o.position[2] + 2}
                  fill="white"
                  fontSize="8"
                >
                  {o.name}
                </text>
              </g>
            ))}
          {x !== null && z !== null && (
            <circle cx={x} cy={z} r="4" fill="#70f5cc">
              <title>Your vehicle</title>
            </circle>
          )}
        </g>
      </svg>
    </section>
  );
}
