import { useEffect, useState } from 'react';
import { excavateRoute, presetPath, SEGMENT_PRESETS, type RouteKind } from '../generation/excavation';
import { useLayoutStore, layoutAction } from '../state/layoutStore';
import { useExcavationPreview } from '../state/excavationPreview';
import { switchBuilderWorld } from '../state/builderActions';
import { HARBOR_EXCHANGE_ID } from '../generation/harborExchange';
import type { V3 } from '../document/layoutDocument';

export function ExcavationTools() {
  const doc = useLayoutStore(s => s.doc), cursor = useLayoutStore(s => s.cursor);
  const preview = useExcavationPreview(s => s.preview);
  const [kind, setKind] = useState<RouteKind>('tunnel'), [length, setLength] = useState(24), [bend, setBend] = useState(0);
  const [origin, setOrigin] = useState<V3>([...cursor]), [yaw, setYaw] = useState(0);
  const [width, setWidth] = useState(12), [height, setHeight] = useState(7), [depth, setDepth] = useState(6), [resolution, setResolution] = useState(2);
  const [custom, setCustom] = useState(''), [rails, setRails] = useState(true), [waterfall, setWaterfall] = useState(false);
  const clear = () => useExcavationPreview.setState({ preview: null });
  useEffect(() => { if (preview && preview.base !== doc) clear(); }, [doc, preview]);
  useEffect(() => {
    const cancel = () => clear();
    window.addEventListener('avenlab:cancel-authoring', cancel);
    return () => { clear(); window.removeEventListener('avenlab:cancel-authoring', cancel); };
  }, []);
  const canal = kind.startsWith('canal');
  const build = () => layoutAction(() => {
    if (!doc) return;
    const points = custom.trim() ? custom.trim().split('\n').map((line): V3 => {
      const pair = line.trim().split(/[\s,]+/).map(Number);
      if (pair.length !== 2 || pair.some(n => !Number.isFinite(n))) throw Error('Each custom path row must contain world X, Z in metres');
      return [pair[0], origin[1], pair[1]];
    }) : presetPath(length, bend, origin, yaw);
    const result = excavateRoute(doc, { kind, points, width, height, depth, resolution, rails, waterfall: canal && waterfall });
    useLayoutStore.setState({ placing: null, selected: null, view: '3d', status: 'Excavation preview · cyan outlines show the requested passage. Apply commits one undoable edit.' });
    useExcavationPreview.setState({ preview: { ...result, base: doc } });
  });
  const number = (label: string, value: number, update: (n: number) => void, min: number, max: number, step = 1) => <label className="le-title-label">{label}
    <input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={e => { clear(); update(Number(e.target.value)); }} />
  </label>;
  return <section className="le-coastal-generator" aria-label="Collision excavation tools">
    <h3>Road, tunnel & canal excavation</h3>
    <p>Cuts unlocked mountain colliders. Preview the physical shapes before applying. Existing roads and buildings stay editable.</p>
    <label className="le-title-label">Route type<select aria-label="Excavation route type" value={kind} onChange={e => { clear(); setKind(e.target.value as RouteKind); }}>
      <option value="road">Open mountain road cut</option><option value="tunnel">Hillside tunnel</option>
      <option value="underpass">Urban underpass</option><option value="canal">Open canal</option><option value="canal-tunnel">Mountain canal tunnel</option>
    </select></label>
    <label className="le-title-label">Segment preset<select aria-label="Excavation segment preset" value={Object.entries(SEGMENT_PRESETS).find(([, n]) => n === length)?.[0] ?? 'custom'} onChange={e => {
      const next = SEGMENT_PRESETS[e.target.value as keyof typeof SEGMENT_PRESETS]; if (next) { clear(); setLength(next); }
    }}><option value="custom" disabled>Custom length</option>{Object.entries(SEGMENT_PRESETS).map(([id, n]) => <option key={id} value={id}>{id} · {n} m</option>)}</select></label>
    <div className="le-twin">{number('Path length (m)', length, setLength, 6, 384)}{number('Turn (degrees)', bend, setBend, -180, 180, 15)}</div>
    <div className="le-twin">{number('Clear width (m)', width, setWidth, 4, 48)}{number('Clear height (m)', height, setHeight, 3, 24)}</div>
    {canal && number('Water depth (m)', depth, setDepth, 1, 16)}
    <div className="le-twin">{number('Cut resolution (m)', resolution, setResolution, .5, 4, .5)}{number('Entry heading (degrees)', yaw, setYaw, -180, 180, 15)}</div>
    <p>Smaller cut resolution makes finer rock edges and uses more colliders. The standard segment is 24 m.</p>
    {(['X', 'Y', 'Z'] as const).map((axis, i) => <div key={axis}>{number(`Entry ${axis} (m)`, origin[i], n => setOrigin(p => p.map((v, k) => k === i ? n : v) as V3), -99000, 99000, .5)}</div>)}
    <button onClick={() => { clear(); setOrigin([...cursor]); }}>Use construction cursor</button>
    <label className="le-title-label">Custom centreline (optional)
      <textarea aria-label="Excavation custom path" rows={4} placeholder="World X, Z per row; leave blank for preset" value={custom} onChange={e => { clear(); setCustom(e.target.value); }} />
    </label>
    <p>Custom points replace the preset. Round bends with intermediate points; each join allows up to 30°.</p>
    <label><input type="checkbox" checked={rails} onChange={e => { clear(); setRails(e.target.checked); }} /> Road edge barriers</label>
    {canal && <label><input type="checkbox" checked={waterfall} onChange={e => { clear(); setWaterfall(e.target.checked); }} /> Waterfall rock terminus (blocks passage)</label>}
    <button disabled={!doc} onClick={build}>Preview collision cut</button>
    {preview && preview.base === doc && <>
      <p role="status">{preview.length.toFixed(1)} m route · {preview.changed} mountains cut · {preview.shapes} explicit colliders. Preview only.</p>
      <p>{preview.obstructions.length ? `Review remaining passage obstructions: ${preview.obstructions.slice(0, 8).join(', ')}${preview.obstructions.length > 8 ? '…' : ''}` : 'No remaining box obstructions in the requested passage.'}</p>
      {preview.uncheckedAssets > 0 && <p>Nearby imported road/model surfaces require Apply & Test Drive to check their measured collision meshes.</p>}
      <div className="le-twin"><button onClick={() => layoutAction(() => {
        const current = useLayoutStore.getState();
        if (current.doc !== preview.base) { clear(); return; }
        current.commit(preview.doc, 'Excavation applied. Undo restores the mountain and route together. Save / Export includes every physical shape.');
        clear();
      })}>Apply excavation</button><button onClick={clear}>Cancel preview</button></div>
    </>}
    <h3>Harbor Exchange</h3>
    <p>Separate collision test district: mountain tunnel, curved cutting, canal, waterfall, elevated crossing and urban underpass.</p>
    <button onClick={() => { clear(); void switchBuilderWorld(HARBOR_EXCHANGE_ID); }}>Open Harbor Exchange</button>
  </section>;
}
