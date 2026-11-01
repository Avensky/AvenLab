import { useState } from "react";
import type { WorldLayout } from "../document/layoutDocument";
import { coastalDistrict } from "../generation/coastalDistrict";
import { useBuilderStore } from "../state/builderStore";
import { layoutAction, useLayoutStore } from "../state/layoutStore";

/** Replacing a district is one ordinary, undoable authoring transaction. */
export function CoastalGenerator() {
  const [seed, setSeed] = useState("1"), [armedFor, setArmedFor] = useState<WorldLayout | null>(null);
  const doc = useLayoutStore(s => s.doc);
  const armed = Boolean(doc && armedFor === doc);
  const mapId = doc?.map_id;
  const loading = useBuilderStore(s => s.loadingMap);
  const generate = () => {
    const state = useLayoutStore.getState();
    if (!state.doc || useBuilderStore.getState().loadingMap) return;
    if (!armed && (state.doc.objects.length || state.doc.spawns?.length)) {
      setArmedFor(state.doc);
      return;
    }
    const ok = layoutAction(() => {
      if (!/^\d{1,10}$/.test(seed)) throw Error("Enter a whole-number seed from 0 to 4294967295");
      const source = useBuilderStore.getState().doc;
      state.commit(coastalDistrict(state.doc!.map_id, Number(seed), source?.surface.road_y ?? 0),
        "Coastal district generated. Water is visual; fleet decks and barriers are static. Undo restores the previous layout.");
      useLayoutStore.setState({ selected: null, selectedSpawn: null, placing: null,
        reference: false, focus: "layout", cameraRevision: state.cameraRevision + 1 });
    });
    if (ok) setArmedFor(null);
  };
  return <div className="le-coastal-generator">
    <label className="le-title-label">Coastal district seed
      <input aria-label="Coastal district seed" inputMode="numeric" value={seed}
        maxLength={10} onChange={e => { setSeed(e.target.value); setArmedFor(null); }} />
    </label>
    <p>Canals, bridges, damaged crossing, harbor and static fleet decks. Editable collider shapes; visual water only.</p>
    {armed && <p role="status">Replace this layout? Undo restores it.</p>}
    <div className="le-twin">
      <button disabled={!mapId || Boolean(loading)} onClick={generate}>
        {armed ? "Replace with coastal district" : "Generate coastal district"}
      </button>
      {armed && <button onClick={() => setArmedFor(null)}>Cancel</button>}
    </div>
  </div>;
}
