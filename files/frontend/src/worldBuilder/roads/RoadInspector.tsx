import type { LayoutObject } from "../document/layoutDocument";
import { layoutAction, useLayoutStore } from "../state/layoutStore";
import { roadAsset } from "./roadCatalog";
import { opposingRoadPair } from "./roadPair";
export function RoadInspector({ item }: { item: LayoutObject }) {
  const r = item.road!,
    asset = roadAsset(r.asset)!,
    state = useLayoutStore();
  const change = (patch: Partial<typeof r>) =>
    layoutAction(() => state.update({ road: { ...r, ...patch } }));
  const sides =
    r.asset === "intersection"
      ? (["nw", "ne", "sw", "se"] as const)
      : (["left", "right"] as const);
  return (
    <section className="le-road-settings" aria-label="Road module settings">
      <h3>
        Sidewalk modules <small>geometry + collision</small>
      </h3>
      {sides.map((side) => (
        <label className="le-check" key={side}>
          <input
            type="checkbox"
            aria-label={`Show ${side} sidewalk`}
            disabled={item.locked}
            checked={r.variant[side]}
            onChange={(e) =>
              change({ variant: { ...r.variant, [side]: e.target.checked } })
            }
          />
          <span>
            {side.length === 2
              ? side.toUpperCase() + " corner"
              : side[0].toUpperCase() + side.slice(1) + " sidewalk"}
          </span>
        </label>
      ))}
      <h3>Physical surfaces</h3>
      {(["surface", "curbs", "paving"] as const).map((key) => (
        <label className="le-check" key={key}>
          <input
            type="checkbox"
            aria-label={`Collide with ${key}`}
            disabled={item.locked || !item.solid}
            checked={r.collision[key]}
            onChange={(e) =>
              change({ collision: { ...r.collision, [key]: e.target.checked } })
            }
          />
          <span>
            {key === "surface"
              ? "Asphalt"
              : key === "curbs"
                ? "Curb faces"
                : "Sidewalk paving"}
          </span>
        </label>
      ))}
      <h3>
        Visual details <small>no physics</small>
      </h3>
      {(["markings", "details"] as const).map((key) => (
        <label className="le-check" key={key}>
          <input
            type="checkbox"
            aria-label={`Show road ${key}`}
            disabled={item.locked}
            checked={r.variant[key]}
            onChange={(e) =>
              change({ variant: { ...r.variant, [key]: e.target.checked } })
            }
          />
          <span>
            {key === "markings" ? "Lane markings" : "Drains and details"}
          </span>
        </label>
      ))}
      <label className="le-road-lod">
        Visual detail
        <select
          aria-label="Road visual LOD"
          value={r.lod}
          disabled={item.locked}
          onChange={(e) =>
            change({
              lod:
                e.target.value === "auto"
                  ? "auto"
                  : (Number(e.target.value) as 0 | 1 | 2),
            })
          }
        >
          <option value="auto">Distance based</option>
          <option value="0">High · LOD0</option>
          <option value="1">Medium · LOD1</option>
          <option value="2">Low · LOD2</option>
        </select>
      </label>
      <p className="le-tip">
        Collision always uses measured LOD0 surfaces. Paint and drains remain
        decorative. Disabling Physical collisions makes the whole module
        decorative.
      </p>
      {r.asset === "road_narrow" && (
        <button
          className="le-wide le-road-pair"
          disabled={item.locked}
          onClick={() =>
            layoutAction(() => {
              if (!state.doc) return;
              const doc = opposingRoadPair(state.doc, item.id);
              state.commit(
                doc,
                "Opposing carriageway added. Adjacent sidewalks removed; asphalt boundaries aligned.",
              );
              useLayoutStore.setState({
                selected: doc.objects.at(-1)!.id,
                snapBasis: "asphalt",
                cameraRevision: state.cameraRevision + 1,
              });
            })
          }
        >
          + Add opposing carriageway
        </button>
      )}
      <p className="le-road-measure">
        SOURCE ASPHALT ·{" "}
        {(asset.surface.max[0] - asset.surface.min[0]).toFixed(3)} ×{" "}
        {(asset.surface.max[2] - asset.surface.min[2]).toFixed(3)} m
      </p>
    </section>
  );
}
