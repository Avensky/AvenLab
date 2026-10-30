import type { V3, WorldLayout } from "./layoutDocument";
import type { MapDocument } from "./mapDocument";
/** Positions are runtime metres, Y-up. Heading is degrees in the editor;
 * schema-2 team_spawns stores radians. Convert only at this boundary. */
export type LayoutSpawn = {
  id: string;
  team: "red" | "blue";
  position: V3;
  yaw: number;
};
export const MAX_TEAM_SPAWNS = 256;
export function validateSpawns(value: unknown): asserts value is LayoutSpawn[] {
  if (!Array.isArray(value) || value.length > MAX_TEAM_SPAWNS * 2)
    throw Error("Use at most 256 spawn points per team");
  const ids = new Set<string>(),
    counts = { red: 0, blue: 0 };
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !/^spawn-[\w-]{1,80}$/.test(item.id) ||
      ids.has(item.id) ||
      !["red", "blue"].includes(item.team) ||
      !Array.isArray(item.position) ||
      item.position.length !== 3 ||
      !item.position.every(
        (v: unknown) =>
          typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100000,
      ) ||
      typeof item.yaw !== "number" ||
      !Number.isFinite(item.yaw) ||
      Math.abs(item.yaw) > 36000
    )
      throw Error("Invalid spawn point, position or heading");
    ids.add(item.id);
    if (++counts[item.team as "red" | "blue"] > MAX_TEAM_SPAWNS)
      throw Error("Use at most 256 spawn points per team");
  }
}
export function sourceSpawns(source: MapDocument): LayoutSpawn[] {
  const teams = source.team_spawns as
    | {
        red?: {
          chunk: [number, number];
          local: [number, number];
          yaw?: number;
          surface_y?: number;
        }[];
        blue?: {
          chunk: [number, number];
          local: [number, number];
          yaw?: number;
          surface_y?: number;
        }[];
      }
    | undefined;
  return (["red", "blue"] as const).flatMap((team) =>
    (teams?.[team] ?? []).map((point, i) => ({
      id: `spawn-${team}-${i + 1}`,
      team,
      position: [
        point.chunk[0] * source.cell[0] + point.local[0],
        point.surface_y ?? source.surface.road_y,
        point.chunk[1] * source.cell[1] + point.local[1],
      ] as V3,
      yaw: ((point.yaw ?? 0) * 180) / Math.PI,
    })),
  );
}
export function exportedSpawns(layout: WorldLayout) {
  if (layout.spawns === undefined) return undefined;
  validateSpawns(layout.spawns);
  if (
    !layout.spawns.some((p) => p.team === "red") ||
    !layout.spawns.some((p) => p.team === "blue")
  )
    throw Error(
      "Place at least one Red and one Blue spawn before exporting the map",
    );
  const team = (name: "red" | "blue") =>
    layout
      .spawns!.filter((p) => p.team === name)
      .map((p) => ({
        chunk: [0, 0],
        local: [p.position[0], p.position[2]],
        yaw: (p.yaw * Math.PI) / 180,
        surface_y: p.position[1],
      }));
  return { red: team("red"), blue: team("blue") };
}
export function updateSpawn(
  layout: WorldLayout,
  id: string,
  changes: Partial<Omit<LayoutSpawn, "id">>,
): WorldLayout {
  if (!layout.spawns?.some((p) => p.id === id))
    throw Error("Select a spawn point first");
  const spawns = layout.spawns.map((p) =>
    p.id === id ? { ...p, ...changes } : p,
  );
  validateSpawns(spawns);
  return { ...layout, spawns };
}
