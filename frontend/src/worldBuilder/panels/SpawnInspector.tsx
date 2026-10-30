import { NumberField } from "../components/NumberField";
import type { V3 } from "../document/layoutDocument";
import { layoutAction, useLayoutStore } from "../state/layoutStore";
export function SpawnInspector() {
  const doc = useLayoutStore((s) => s.doc),
    selected = useLayoutStore((s) => s.selectedSpawn),
    cursor = useLayoutStore((s) => s.cursor),
    yaw = useLayoutStore((s) => s.placementYaw),
    step = useLayoutStore((s) => s.snap),
    angle = useLayoutStore((s) => s.angleSnap);
  const point = doc?.spawns?.find((p) => p.id === selected),
    state = useLayoutStore.getState();
  return (
    <div className="le-spawns">
      <h2>Vehicle spawns</h2>
      <p className="le-tip">
        Red and Blue starts. Y is the support surface; Rust adds the vehicle’s
        suspension clearance. The arrow points along local +Z at 0°.
      </p>
      <div className="le-twin">
        {(["red", "blue"] as const).map((team) => (
          <button
            key={team}
            disabled={!doc}
            onClick={() =>
              layoutAction(() => state.addSpawn(team, [...cursor], yaw))
            }
          >
            + {team} at cursor
          </button>
        ))}
      </div>
      <div className="le-scene-list">
        {doc?.spawns?.map((spawn, i) => (
          <button
            key={spawn.id}
            aria-pressed={selected === spawn.id}
            onClick={() => state.selectSpawn(spawn.id)}
          >
            <span
              className="le-object-dot"
              style={{
                background: spawn.team === "red" ? "#ff687d" : "#78b3ff",
              }}
            />
            <span>
              {spawn.team.toUpperCase()} {i + 1}
            </span>
            <small>{Math.round(spawn.yaw)}°</small>
          </button>
        ))}
      </div>
      {point && (
        <>
          <label className="le-road-lod">
            Team
            <select
              aria-label="Spawn team"
              value={point.team}
              onChange={(e) =>
                layoutAction(() =>
                  state.updateSpawn({ team: e.target.value as "red" | "blue" }),
                )
              }
            >
              <option value="red">Red</option>
              <option value="blue">Blue</option>
            </select>
          </label>
          <div className="le-number-row">
            {["X", "Y", "Z"].map((axis, i) => (
              <NumberField
                key={axis}
                label={`Spawn ${axis}`}
                value={point.position[i]}
                step={step}
                onCommit={(value) => {
                  const position = [...point.position] as V3;
                  position[i] = value;
                  state.updateSpawn({ position });
                }}
              />
            ))}
          </div>
          <NumberField
            label="Spawn heading"
            value={point.yaw}
            step={angle}
            onCommit={(yaw) => state.updateSpawn({ yaw })}
          />
          <div className="le-twin">
            <button
              onClick={() =>
                layoutAction(() =>
                  state.updateSpawn({ position: [...cursor], yaw }),
                )
              }
            >
              Move to cursor
            </button>
            <button onClick={() => layoutAction(state.removeSpawn)}>
              Delete spawn
            </button>
          </div>
        </>
      )}
    </div>
  );
}
