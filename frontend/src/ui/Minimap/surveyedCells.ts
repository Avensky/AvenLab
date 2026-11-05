import { create } from "zustand";
import type { MapSnapshot } from "../../store/world/worldStore";
import type { DebugAabbBox } from "../../store/session/networkStore";
import { charted, isHarbor } from "./HarborChart";

export type SurveyCell = { x: number; z: number; boxes: DebugAabbBox[] };
export const useSurvey = create<{
  key: string | null;
  cells: Map<string, SurveyCell>;
}>(() => ({ key: null, cells: new Map() }));
let sampledMap: MapSnapshot | null = null,
  lastCell = "";

// A team chart can contain sectors scouted by allies. The full map uses only
// sectors this player visited, intersected with the server chart in harbors.
export function personalChart(
  cells: Map<string, SurveyCell>,
  teamChart?: string,
) {
  return [...cells.values()].filter(
    (cell) =>
      teamChart === undefined || charted(teamChart, cell.x + 50, cell.z + 50),
  );
}
export function surveyPosition(
  key: string | null,
  map: MapSnapshot | null,
  position?: number[],
) {
  if (key !== useSurvey.getState().key) {
    useSurvey.setState({ key, cells: new Map() });
    lastCell = "";
    sampledMap = null;
  }
  if (
    !key ||
    !map ||
    !position ||
    !Number.isFinite(position[0]) ||
    !Number.isFinite(position[2])
  )
    return;
  const x = Math.floor(position[0] / 100) * 100,
    z = Math.floor(position[2] / 100) * 100,
    id = x + "," + z;
  if (lastCell === id && sampledMap === map) return;
  lastCell = id;
  sampledMap = map;
  const harbor = isHarbor(map.map_id);
  if (harbor && useSurvey.getState().cells.has(id)) return;
  const boxes = (harbor ? [] : (map.collider_chunks ?? []))
    .flatMap((c) => c.boxes)
    .filter((b) => {
      const [cx, , cz] = b.center,
        [hx, , hz] = b.half_extents;
      return (
        cx + hx >= x && cx - hx <= x + 100 && cz + hz >= z && cz - hz <= z + 100
      );
    });
  const cells = new Map(useSurvey.getState().cells);
  cells.set(id, { x, z, boxes });
  useSurvey.setState({ cells });
}
