import React, { useEffect, useState } from 'react';
import axios, { AxiosError } from 'axios';
import VehicleConfigsEditor from './VehicleConfigsEditor'

// --- Types ---
type Dims = {
    length_m?: number | null;
    width_m?: number | null;
    height_m?: number | null;
    // allow extra keys without breaking
    [key: string]: unknown;
};

export interface VehicleRow {
    id: number;
    alias: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    vin: string | null;
    transmission: string | null;
    drivetrain: string | null;
    wheelbase_mm: number | null;
    weight_kg: number | null;
    dims_json: Dims | null; // { length_m, width_m, height_m }
    notes: string | null;
    created_at?: string;
    updated_at?: string;
}

type NewVehicle = Omit<VehicleRow, 'id'>;

const BLANK: NewVehicle = {
    alias: '',
    make: '',
    model: '',
    year: null,
    vin: '',
    transmission: '',
    drivetrain: '',
    wheelbase_mm: null,
    weight_kg: null,
    dims_json: { length_m: null, width_m: null, height_m: null },
    notes: ''
};

// add near other imports/state
type Tab = 'vehicles' | 'configs';

// ---- helpers ----
function toErrorMessage(e: unknown): string {
    const ax = e as AxiosError<{ error?: string }>;
    return ax?.response?.data?.error || ax?.message || 'Request failed';
}

// --- Component ---
export default function VehicleManager() {
    const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // form state
    const [form, setForm] = useState<NewVehicle>({ ...BLANK });
    const [editingId, setEditingId] = useState<number | null>(null);
    const isEditing = editingId !== null;
    const [dimsInput, setDimsInput] = useState(''); // controlled text for dims_json
    useEffect(() => {
        // whenever dims_json in the form changes, reflect it in the textarea
        setDimsInput(JSON.stringify(form.dims_json ?? {}, null, 2));
    }, [form.dims_json, editingId]);

    const [tab, setTab] = useState<Tab>('vehicles');

    // for the Configs tab
    const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
    useEffect(() => {
        if (vehicles.length && selectedVehicleId == null) setSelectedVehicleId(vehicles[0].id);
    }, [vehicles, selectedVehicleId]);

    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get('/api/v1/vehicles');
                // be permissive about backend shape
                const rows = (res.data?.vehicles ?? res.data?.data ?? []) as VehicleRow[];
                setVehicles(rows);
            } catch (e: unknown) {
                setError(toErrorMessage(e));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    function onChange<K extends keyof NewVehicle>(key: K, value: NewVehicle[K]) {
        setForm(prev => ({ ...prev, [key]: value }));
    }

    function parseDimsJson(raw: string): Dims {
        try {
            const parsed = raw.trim() ? JSON.parse(raw) : {};
            return parsed as Dims;
        } catch {
            throw new Error('dims_json must be valid JSON (e.g., {"length_m":4.2,"width_m":1.77,"height_m":1.29})');
        }
    }

    function validate(): string | null {
        if (!form.alias || !form.alias.trim()) return 'Alias is required';
        if (!form.make || !form.make.trim()) return 'Make is required';
        if (!form.model || !form.model.trim()) return 'Model is required';
        if (form.year !== null && !Number.isFinite(Number(form.year))) return 'Year must be a number or left blank';
        return null;
    }

    async function handleSubmit() {
        setError(null);
        const err = validate();
        if (err) { setError(err); return; }

        // Coerce numeric fields (keep exact NewVehicle type)
        const payload: NewVehicle = {
            ...form,
            year: form.year === null || form.year === undefined ? null : Number(form.year),
            wheelbase_mm: form.wheelbase_mm === null || form.wheelbase_mm === undefined ? null : Number(form.wheelbase_mm),
            weight_kg: form.weight_kg === null || form.weight_kg === undefined ? null : Number(form.weight_kg),
        };

        try {
            if (isEditing) {
                const res = await axios.put(`/api/v1/vehicles/${editingId}`, payload);
                const row = (res.data?.vehicle ?? res.data) as VehicleRow;
                setVehicles(prev => prev.map(v => (v.id === editingId ? row : v)));
            } else {
                const res = await axios.post('/api/v1/vehicles', payload);
                const row = (res.data?.vehicle ?? res.data) as VehicleRow;
                setVehicles(prev => [row, ...prev]);
            }
            // reset form
            setForm({ ...BLANK });
            setEditingId(null);
        } catch (e: unknown) {
            setError(toErrorMessage(e));
        }
    }

    function startEdit(v: VehicleRow) {
        setEditingId(v.id);
        setForm({
            alias: v.alias ?? '',
            make: v.make ?? '',
            model: v.model ?? '',
            year: v.year ?? null,
            vin: v.vin ?? '',
            transmission: v.transmission ?? '',
            drivetrain: v.drivetrain ?? '',
            wheelbase_mm: v.wheelbase_mm ?? null,
            weight_kg: v.weight_kg ?? null,
            dims_json: v.dims_json ?? {},
            notes: v.notes ?? ''
        });
    }

    async function onDelete(id: number) {
        if (!confirm('Delete this vehicle?')) return;
        try {
            await axios.delete(`/api/v1/vehicles/${id}`);
            setVehicles(prev => prev.filter(v => v.id !== id));
            if (editingId === id) { setEditingId(null); setForm({ ...BLANK }); }
        } catch (e: unknown) {
            setError(toErrorMessage(e));
        }
    }

    return (
        <div className="text-gray-100 p-2 space-y-3">
            <h2 className="text-xl font-semibold event-success">Vehicles</h2>
            <div className="flex gap-2 mb-2">
                <button
                    className={`px-3 py-1 rounded ${tab === 'vehicles' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                    onClick={() => setTab('vehicles')}
                >Vehicles</button>
                <button
                    className={`px-3 py-1 rounded ${tab === 'configs' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                    onClick={() => setTab('configs')}
                >Configs & Override</button>
            </div>
            {tab === 'configs' ? (
                <div className="">
                    {/* vehicle selector */}
                    <div className="flex items-center gap-2 pb-2">
                        <span className="text-sm">Vehicle:</span>
                        <select
                            className="bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm"
                            value={selectedVehicleId ?? ''}
                            onChange={e => setSelectedVehicleId(e.target.value ? Number(e.target.value) : null)}
                        >
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.alias || `${v.make} ${v.model} ${v.year ?? ''}`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <VehicleConfigsEditor vehicleId={selectedVehicleId} />
                </div>
            ) : (
                <div className="">
                    {/* Status */}
                    {loading && <div className="text-sm text-gray-400">Loading…</div>}
                    {error && (
                        <div className="text-red-400 text-sm">{error}</div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Form */}
                        <div className="md:col-span-1 bg-black/20 border border-gray-700 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">{isEditing ? 'Edit vehicle' : 'Create vehicle'}</h3>
                                {isEditing && (
                                    <button
                                        className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                                        onClick={() => { setEditingId(null); setForm({ ...BLANK }); }}
                                        title="Cancel edit"
                                    >Cancel</button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <label className="col-span-2">Alias*
                                    <input value={form.alias as string}
                                        onChange={e => onChange('alias', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="2015-scion-frs" />
                                </label>

                                <label>Make*
                                    <input value={form.make as string}
                                        onChange={e => onChange('make', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="Scion" />
                                </label>

                                <label>Model*
                                    <input value={form.model as string}
                                        onChange={e => onChange('model', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="FR-S" />
                                </label>

                                <label>Year
                                    <input
                                        value={form.year ?? ''}
                                        onChange={e => onChange('year', e.target.value === '' ? null : Number(e.target.value))}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="2015" />
                                </label>
                                <label>VIN
                                    <input value={form.vin as string}
                                        onChange={e => onChange('vin', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="(optional)" />
                                </label>

                                <label>Transmission
                                    <input value={form.transmission as string}
                                        onChange={e => onChange('transmission', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="MT / AT" />
                                </label>
                                <label>Drivetrain
                                    <input value={form.drivetrain as string}
                                        onChange={e => onChange('drivetrain', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="RWD / FWD / AWD" />
                                </label>

                                <label>Wheelbase (mm)
                                    <input
                                        value={form.wheelbase_mm ?? ''}
                                        onChange={e => onChange('wheelbase_mm', e.target.value === '' ? null : Number(e.target.value))}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="2570" />
                                </label>
                                <label>Weight (kg)
                                    <input
                                        value={form.weight_kg ?? ''}
                                        onChange={e => onChange('weight_kg', e.target.value === '' ? null : Number(e.target.value))}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="1250" />
                                </label>

                                <label className="col-span-2">Dims JSON
                                    <textarea
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 font-mono text-xs min-h-20"
                                        value={dimsInput}
                                        onChange={(e) => setDimsInput(e.target.value)}
                                        onBlur={() => {
                                            try {
                                                const parsed = parseDimsJson(dimsInput);
                                                onChange('dims_json', parsed);
                                                setError(null);
                                            } catch (err) {
                                                setError((err as Error).message);
                                            }
                                        }}
                                        placeholder='{"length_m": 4.24, "width_m": 1.77, "height_m": 1.28}'
                                    />
                                </label>

                                <label className="col-span-2">Notes
                                    <textarea value={form.notes as string}
                                        onChange={e => onChange('notes', e.target.value)}
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                                        placeholder="Any extra info…" />
                                </label>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button onClick={handleSubmit}
                                    className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold">
                                    {isEditing ? 'Update' : 'Create'}
                                </button>
                                <button onClick={() => { setForm({ ...BLANK }); setEditingId(null); }}
                                    className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm">
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="md:col-span-2 bg-black/10 border border-gray-700 rounded-lg p-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold">Saved vehicles</h3>
                                <button className="text-xs bg-blue-700 hover:bg-blue-600 rounded px-2 py-1"
                                    onClick={() => { setForm({ ...BLANK }); setEditingId(null); }}>
                                    + New
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-gray-300">
                                        <tr className="border-b border-gray-700">
                                            <th className="py-1 pr-2">Alias</th>
                                            <th className="py-1 pr-2">Make</th>
                                            <th className="py-1 pr-2">Model</th>
                                            <th className="py-1 pr-2">Year</th>
                                            <th className="py-1 pr-2">Trans</th>
                                            <th className="py-1 pr-2">Drive</th>
                                            <th className="py-1 pr-2">WB (mm)</th>
                                            <th className="py-1 pr-2">Weight (kg)</th>
                                            <th className="py-1 pr-2">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vehicles.map(v => (
                                            <tr key={v.id} className="border-b border-gray-800 hover:bg-white/5">
                                                <td className="py-1 pr-2">{v.alias || '—'}</td>
                                                <td className="py-1 pr-2">{v.make || '—'}</td>
                                                <td className="py-1 pr-2">{v.model || '—'}</td>
                                                <td className="py-1 pr-2">{v.year ?? '—'}</td>
                                                <td className="py-1 pr-2">{v.transmission || '—'}</td>
                                                <td className="py-1 pr-2">{v.drivetrain || '—'}</td>
                                                <td className="py-1 pr-2">{v.wheelbase_mm ?? '—'}</td>
                                                <td className="py-1 pr-2">{v.weight_kg ?? '—'}</td>
                                                <td className="py-1 pr-2 flex gap-2">
                                                    <button className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                                                        onClick={() => startEdit(v)}
                                                    >Edit</button>
                                                    <button className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600"
                                                        onClick={() => onDelete(v.id)}
                                                    >Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!vehicles || vehicles.length === 0) && !loading && (
                                            <tr><td colSpan={9} className="py-3 text-center text-gray-400">No vehicles yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>)}
        </div>
    );
}
