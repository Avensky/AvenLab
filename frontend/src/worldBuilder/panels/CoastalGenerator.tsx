import { useState } from "react";
import type { DistrictSize } from "../generation/coastalDistrict";
import type { WorldLayout } from "../document/layoutDocument";
import { COASTAL_MAP_ID } from "../generation/coastalMap";
import { useBuilderStore } from "../state/builderStore";
import { useLayoutStore } from "../state/layoutStore";
import { openCoastalDistrict, replaceCoastalDistrict } from "../state/builderActions";
import { useSocialStore } from "../../store/social/socialStore";
import { applyEditorDraft } from "../../game/alpha/applyEditorDraft";

export function CoastalGenerator() {
  const [seed, setSeed] = useState("1"), [armedFor, setArmedFor] = useState<WorldLayout | null>(null),
    [busy, setBusy] = useState(false);
  const [size, setSize] = useState<DistrictSize>("chunk");
  const [landBridge, setLandBridge] = useState(true);
  const doc = useLayoutStore(s => s.doc);
  const armed = Boolean(doc && armedFor === doc);
  const loading = useBuilderStore(s => s.loadingMap);
  const generate = async () => {
    if (busy || loading || !doc) return;
    setBusy(true);
    try {
      if (!/^\d{1,10}$/.test(seed) || Number(seed) > 0xffffffff)
        throw Error("Enter a whole-number seed from 0 to 4294967295");
      if (useBuilderStore.getState().doc?.map_id !== COASTAL_MAP_ID) {
        await openCoastalDistrict();
        setArmedFor(useLayoutStore.getState().doc);
        useLayoutStore.setState({ status: "Coastal District opened. Your previous world's draft is retained. Confirm generation to replace this coastal layout." });
        return;
      }
      if (!armed && (doc.objects.length || doc.spawns?.length)) {
        setArmedFor(doc);
        return;
      }
      replaceCoastalDistrict(Number(seed), size, landBridge);
      setArmedFor(null);
      if (useSocialStore.getState().view?.alpha?.active?.mode === "editor") {
        await applyEditorDraft();
        useLayoutStore.setState({ status: "Coastal District active · live editor rebuilt and vehicle reset to its starting zone. Draft saved in this browser; Export map for permanent installation." });
      } else useLayoutStore.setState({ status: "Coastal District generated and selected · saved in this browser. Reserve Live Editor, then Apply & Test Drive to drive this draft." });
    } catch (error) {
      useLayoutStore.setState({ status: `${(error as Error).message} · Draft retained. Use Apply & Test Drive to retry a live rebuild.` });
    } finally { setBusy(false); }
  };
  return <div className="le-coastal-generator">
    <label className="le-title-label">Coastal district seed
      <input aria-label="Coastal district seed" inputMode="numeric" value={seed} disabled={busy}
        maxLength={10} onChange={e => { setSeed(e.target.value); setArmedFor(null); }} />
    </label>
    <label className="le-title-label">District footprint
      <select aria-label="District footprint" disabled={busy} value={size} onChange={e => { setSize(e.target.value as DistrictSize); setArmedFor(null); }}>
        <option value="block">City block · about 100 m</option>
        <option value="chunk">2×2 city chunk · about 200 m</option>
        <option value="massive">3×3 of 2×2 chunks · about 600 m</option>
      </select>
    </label>
    <label><input type="checkbox" checked={landBridge} disabled={busy} onChange={e => { setLandBridge(e.target.checked); setArmedFor(null); }} /> Permanent land bridge on safe loop</label>
    <p>Separate Coastal District save slot. Larger chase islands, starting zones, bridges and a jump shortcut. Water and fleet decks remain static.</p>
    {armed && <p role="status">Replace the Coastal District layout? Undo restores it. Other worlds are preserved.</p>}
    <div className="le-twin">
      <button disabled={!doc || Boolean(loading) || busy} onClick={() => void generate()}>
        {busy ? "Building coastal district…" : armed ? "Replace with coastal district" : "Generate coastal district"}
      </button>
      {armed && <button disabled={busy} onClick={() => setArmedFor(null)}>Cancel</button>}
    </div>
  </div>;
}
