import { CharacterHeaderProfile } from "../../game/characters/CharacterHeaderProfile";
import { WeaponEditor } from "../../combat/WeaponEditor";
import type { MenuAction } from "../../controls/inputRouting";
import { useEffect, useRef, useState } from 'react';
import { requestSocial } from '../../net/socialClient';
import { HEROES } from '../../store/alpha/alphaStore';
import { useUIStore } from '../../store/menus/uiStore';
import { useSocialStore } from '../../store/social/socialStore';
import { useInputStore } from '../../store/input/inputStore';
import { useBuilderStore } from '../state/builderStore';
import { TUNING_FIELDS, tuningOnly, type Tuning } from './tuningFields';
import { DEFAULT_DRIVER, useVehicleEditorStore, type CameraProfile, type CameraView } from './vehicleEditorStore';
import './vehicleEditor.css';
function NumberInput({ value, min, max, step, disabled, onValue }: {
    value: number | '';
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    onValue: (value: number) => void;
}) {
    const [editing, setEditing] = useState(false), [text, setText] = useState('');
    return <input type="number" min={min} max={max} step={step} disabled={disabled} value={editing ? text : value} onFocus={() => { setText(String(value)); setEditing(true); }} onBlur={() => setEditing(false)} onChange={e => { setText(e.target.value); const n = e.target.valueAsNumber; if (Number.isFinite(n))
        onValue(n); }}/>;
}
type Reply = {
    vehicle: string;
    factory: Tuning;
    current: Tuning;
};
/** One panel owns draft settings. Only Apply sends physics to the server. */
export function VehicleEditorPanel({ suspended = false }: { suspended?: boolean }) {
    const root = useRef<HTMLElement>(null);
    const active = useSocialStore(s => s.view?.alpha?.active);
    const [reply, setReply] = useState<Reply | null>(null);
    const [draft, setDraft] = useState<Tuning>({});
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [tab, setTab] = useState('Body');
    const history = useRef<Tuning[]>([]);
    const pending = useRef(false);
    const sequence = useRef(0);
    const editor = useVehicleEditorStore();
    const vehicle = reply?.vehicle ?? '';
    const camera = editor.cameras[vehicle] ?? DEFAULT_DRIVER;
    const live = active?.mode === 'editor';
    const receive = (value: Record<string, unknown>) => {
        const next = value as unknown as Reply;
        setReply(next);
        setDraft(tuningOnly(next.current));
        history.current = [];
    };
    useEffect(() => {
        const requestSequence = sequence;
        const token = ++requestSequence.current;
        if (live)
            void requestSocial('editor_vehicle_get').then(value => {
                if (token === sequence.current)
                    receive(value);
            }).catch(e => { if (token === sequence.current)
                setStatus(e.message); });
        return () => { requestSequence.current++; };
    }, [live]);
    const run = async (operation: () => Promise<void>) => {
        if (pending.current)
            return;
        pending.current = true;
        setBusy(true);
        setStatus('');
        try {
            await operation();
        }
        catch (e) {
            setStatus((e as Error).message);
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    };
    const change = (key: string, value: number | boolean) => {
        history.current = [...history.current, draft].slice(-32);
        setDraft({ ...draft, [key]: value });
    };
    const cameraChange = (key: keyof CameraProfile, value: number) => {
        if (Number.isFinite(value))
            editor.setCamera(vehicle, { ...camera, [key]: value });
    };
    const apply = () => run(async () => {
        receive(await requestSocial('editor_vehicle_apply', { tuning: draft }));
        setStatus('Applied. Vehicle stopped and suspension rebuilt at its current location.');
    });
    const publish = () => run(async () => {
        receive(await requestSocial('editor_vehicle_publish',{tuning:draft}));
        setStatus('SAVED TO SERVER · New vehicles of this model in every world inherit this validated tune. Existing vehicles keep their current physics.');
    });
    const test = () => { useInputStore.getState().releaseControls(); useUIStore.getState().closeOverlay(); };
    useEffect(() => {
        if (suspended) return;
        const navigate = (event: Event) => {
            const action = (event as CustomEvent<MenuAction>).detail;
            if (action === 'back') {
                useVehicleEditorStore.getState().setView('chase');
                useBuilderStore.setState({ workspace: 'layout' });
                return;
            }
            const nodes = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') ?? [])];
            const current = document.activeElement as HTMLElement;
            const index = nodes.indexOf(current);
            if (action === 'activate') {
                (nodes[index] ?? nodes[0])?.click();
                return;
            }
            const direction = action === 'left' || action === 'up' ? -1 : 1;
            if ((action === 'left' || action === 'right') && current instanceof HTMLInputElement && current.type === 'number') {
                const v = Number(current.value) + direction * Number(current.step || 1);
                if (v >= Number(current.min) && v <= Number(current.max)) {
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(current, String(v));
                    current.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            if ((action === 'left' || action === 'right') && current instanceof HTMLSelectElement) {
                current.selectedIndex = (current.selectedIndex + direction + current.options.length) % current.options.length;
                current.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            if (['up', 'down', 'left', 'right'].includes(action))
                nodes[(index + direction + nodes.length) % nodes.length]?.focus();
        };
        window.addEventListener('avenlab:panel-action', navigate);
        return () => window.removeEventListener('avenlab:panel-action', navigate);
    }, [suspended]);
    const stopKeys = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            editor.setView('chase');
            useBuilderStore.setState({ workspace: 'layout' });
        }
    };
    return <section ref={root} className="ve-panel menu-surface" aria-label="Vehicle editor" onKeyDown={stopKeys}>
    <header><button onClick={() => { editor.setView('chase'); useBuilderStore.setState({ workspace: 'layout' }); }}>← WORLD EDITOR</button><strong>EDIT VEHICLE</strong><button disabled={!reply || busy} onClick={test}>TEST DRIVE</button><CharacterHeaderProfile compact readOnly={busy}/></header>
    {!live ? <p>Deploy a vehicle through World Editor to tune its physics.</p> : <>
      <label className="ve-vehicle">TEST VEHICLE<select disabled={busy} value={active?.hero ?? ''} onChange={e => {
                const hero = e.target.value;
                sequence.current++;
                void run(async () => {
                    await requestSocial('hero_select', { hero });
                    receive(await requestSocial('editor_vehicle_get'));
                    editor.setView('chase');
                });
            }}>{HEROES.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
      <nav aria-label="Vehicle settings">{['Body', 'Power', 'Suspension', 'Wheels', 'Steering', 'Camera', 'Materials', 'Weapons'].map(name => <button aria-pressed={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}</nav>
      <div className="ve-fields">
      {tab === 'Weapons' ? <WeaponEditor vehicle={vehicle} onTest={test}/> : tab === 'Materials' ? <>
        <h3>MATERIAL SLOT CHECKLIST · {vehicle.toUpperCase()}</h3>
        <p>Body paint is equipped in Main menu → Heroes and shared with other players. This page reserves the per-car asset mapping work.</p>
        <p>Body: known paint slot. Seats: BRZ yellow bucket material not yet verified. Front seat named nodes contain no mesh data in the current export.</p>
        <p>TODO: assign dedicated seat fabric, stitching, caliper, stripe mask and steering-wheel accent materials. Avoid renaming unrelated meshes; add stable material slot names when updating each GLB.</p>
        <p>Requested naming: Paint_Body, Fabric_Seat, Thread_Seat, Paint_Caliper, Decal_Stripe, Leather_Wheel, Thread_Wheel.</p>
      </> : tab === 'Camera' ? <>
        <p>Driver-eye coordinates are relative to the chassis: +Y up, +Z forward. Fine-tune each vehicle while previewing the driver view.</p>
        {([['x', 'Eye left / right (m)', -4, 4, .01], ['y', 'Eye height (m)', -2, 5, .01], ['z', 'Eye forward / back (m)', -6, 6, .01], ['yaw', 'Look yaw (degrees)', -180, 180, 1], ['pitch', 'Look pitch (degrees)', -80, 80, 1], ['fov', 'Field of view', 30, 110, 1], ['duration', 'Approach duration (s)', 1, 12, .25]] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<NumberInput min={min} max={max} step={step} value={camera[key]} onValue={v => { if (v >= min && v <= max)
                cameraChange(key, v); }}/></label>)}
        <div className="ve-actions">{([['chase', 'EXTERIOR'], ['bird', 'BIRD’S EYE'], ['driver', 'FIRST PERSON'], ['approach', 'REPLAY APPROACH']] as [
                CameraView,
                string
            ][]).map(([view, label]) => <button key={view} onClick={() => editor.setView(view)} aria-pressed={editor.view === view}>{label}</button>)}</div>
        <button onClick={() => editor.setCamera(vehicle, { ...DEFAULT_DRIVER })}>RESET CAMERA</button>
        <p>Camera edits preview immediately and save locally per vehicle. Interior quality depends on the installed model.</p>
      </> : <>
        {TUNING_FIELDS.filter(f => f[6] === tab && !(vehicle==='tank' && ['max_steer_angle','ackermann'].includes(f[0]))).map(([key, label, unit, min, max, step]) => {
                    const factor = key === 'max_speed' ? 3.6 : 1;
                    return <label key={key}>{label} <small>{unit}</small><NumberInput disabled={!reply || busy} min={min * factor} max={max * factor} step={step} value={typeof draft[key] === 'number' ? Number((Number(draft[key]) * factor).toFixed(3)) : ''} onValue={v => change(key, v / factor)}/></label>;
                })}
        {tab === 'Steering' && vehicle==='tank' && <p>Differential tracks steer and pivot the hull. Road-wheel steering angle and Ackermann do not apply.</p>}
        {tab === 'Steering' && ['abs_enabled', 'tcs_enabled'].map(key => <label key={key}>{key === 'abs_enabled' ? 'ABS' : 'Traction control'}<input type="checkbox" disabled={!reply || busy} checked={Boolean(draft[key])} onChange={e => change(key, e.target.checked)}/></label>)}
        {tab === 'Suspension' && <p>Ride height follows suspension length, travel, and sag. Spring stiffness is derived from mass and sag by the existing solver.</p>}
      </>}
      </div>
      {!['Weapons','Camera','Materials'].includes(tab) && <footer className="ve-actions">
        <button disabled={!reply || busy} onClick={() => void apply()}>{busy ? 'WORKING…' : 'APPLY PHYSICS'}</button>
        <button disabled={!reply || busy || ['hawaii-rescue','louisiana'].includes(vehicle)} onClick={() => void publish()} title="Save this validated tuning as the server default for future spawns of this model">PUBLISH SERVER DEFAULT</button>
        <button disabled={!history.current.length || busy} onClick={() => { const previous = history.current.pop(); if (previous)
            setDraft(previous); }}>UNDO</button>
        <button disabled={!reply || busy} onClick={() => { setDraft(tuningOnly(reply!.current)); history.current = []; }}>REVERT DRAFT</button>
        <button disabled={!reply || busy} onClick={() => { history.current.push(draft); setDraft(tuningOnly(reply!.factory)); }}>FACTORY PHYSICS</button>
        <button disabled={!reply || busy} onClick={() => { editor.save(vehicle, draft); setStatus('Preset saved in this browser. Apply physics to activate it.'); }}>SAVE PRESET</button>
        <button disabled={!editor.presets[vehicle] || busy} onClick={() => { const p = editor.presets[vehicle]; history.current.push(draft); setDraft({ ...p.tuning }); editor.setCamera(vehicle, { ...p.camera }); }}>LOAD PRESET</button>
      </footer>}
      {!['Weapons','Camera','Materials'].includes(tab) && <p>APPLY changes only your test vehicle. PUBLISH saves a factory-relative default on the server for new spawns in every world; existing vehicles are not forcibly rebuilt. Naval mass/propeller tuning will get a dedicated editor.</p>}
    </>}
    <output role="status">{status}</output>
  </section>;
}
