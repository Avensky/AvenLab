import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios, { AxiosError } from "axios";

// --- standardized signal keys ---
const LIGHT_KEYS = [
    "LEFT_BLINKER",
    "RIGHT_BLINKER",
    "HAZARD",
    "HEADLIGHTS",
    "DOORS_LOCKED",
    "TRUNK_OPEN",
    "WINDOW_UP",
    "WINDOW_DOWN",
] as const;
type LightKey = typeof LIGHT_KEYS[number];

function labelForKey(k: LightKey): string {
    switch (k) {
        case "LEFT_BLINKER": return "Left blinker";
        case "RIGHT_BLINKER": return "Right blinker";
        case "HAZARD": return "Hazards";
        case "HEADLIGHTS": return "Headlights";
        case "DOORS_LOCKED": return "Doors locked";
        case "TRUNK_OPEN": return "Trunk open";
        case "WINDOW_UP": return "Window up";
        case "WINDOW_DOWN": return "Window down";
    }
}

type Snap = {
    id?: number;
    t_ms: number;
    odometer_km?: number | null;
    fuel_pct?: number | null;
    tire_kpa_fl?: number | null;
    tire_kpa_fr?: number | null;
    tire_kpa_rl?: number | null;
    tire_kpa_rr?: number | null;
    outside_temp_c?: number | null;
    battery_v?: number | null;
    rpm?: number | null;
    speed_kph?: number | null;
    gear?: string | null;
    throttle_pct?: number | null;
    brake_pct?: number | null;
    steering_deg?: number | null;
    engine_temp_c?: number | null;
    dash_lights?: Record<string, boolean> | null;
    gps_lat?: number | null;
    gps_lon?: number | null;
    gps_alt?: number | null;
    created_at?: string;
};

function toNumOrNull(v: string): number | null {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function toErrorMessage(e: unknown): string {
    const ax = e as AxiosError<{ error?: string }>;
    return ax?.response?.data?.error || ax?.message || "Request failed";
}

type Column = { key: keyof Snap; label: string };
const columns: ReadonlyArray<Column> = [
    { key: "t_ms", label: "t (ms)" },
    { key: "rpm", label: "RPM" },
    { key: "speed_kph", label: "Speed" },
    { key: "gear", label: "Gear" },
    { key: "fuel_pct", label: "Fuel %" },
    { key: "odometer_km", label: "Odo km" },
    { key: "battery_v", label: "Batt V" },
    { key: "outside_temp_c", label: "Temp °C" },
    { key: "engine_temp_c", label: "Engine °C" },
];

// defaults for signals
function defaultDash(): Record<LightKey, boolean> {
    return {
        LEFT_BLINKER: false,
        RIGHT_BLINKER: false,
        HAZARD: false,
        HEADLIGHTS: false,
        DOORS_LOCKED: false,
        TRUNK_OPEN: false,
        WINDOW_UP: false,
        WINDOW_DOWN: false,
    };
}
function parseLightsText(text: string): Record<string, boolean> {
    try {
        const raw = text.trim() ? (JSON.parse(text) as unknown) : {};
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            const out: Record<string, boolean> = {};
            for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
                if (typeof v === "boolean") out[k] = v;
            }
            return out;
        }
    } catch { /* ignore */ }
    return {};
}

export default function SessionSnapshots({ sessionId }: { sessionId: number }) {
    const [items, setItems] = useState<Snap[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // create/update form
    const [form, setForm] = useState<{
        t_ms: string;
        odometer_km: string;
        fuel_pct: string;
        tire_kpa_fl: string; tire_kpa_fr: string; tire_kpa_rl: string; tire_kpa_rr: string;
        outside_temp_c: string;
        battery_v: string;
        rpm: string;
        speed_kph: string;
        gear: string;
        throttle_pct: string;
        brake_pct: string;
        steering_deg: string;
        engine_temp_c: string;
        dash_text: string;
    }>(() => ({
        t_ms: "0",
        odometer_km: "",
        fuel_pct: "",
        tire_kpa_fl: "", tire_kpa_fr: "", tire_kpa_rl: "", tire_kpa_rr: "",
        outside_temp_c: "",
        battery_v: "",
        rpm: "",
        speed_kph: "",
        gear: "",
        throttle_pct: "",
        brake_pct: "",
        steering_deg: "",
        engine_temp_c: "",
        dash_text: JSON.stringify(defaultDash(), null, 2),
    }));

    const [dash, setDash] = useState<Record<LightKey, boolean>>(defaultDash());
    const [editingId, setEditingId] = useState<number | null>(null);

    // sync JSON editor when toggles change
    useEffect(() => {
        const json = JSON.stringify(dash, null, 2);
        setForm(f => ({ ...f, dash_text: json }));
    }, [dash]);

    const last = useMemo(() => (items.length ? items[items.length - 1] : null), [items]);

    const refresh = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true); setError(null);
        try {
            const res = await axios.get(`/api/v1/sessions/${sessionId}/state/snapshots`);
            setItems(res.data?.snapshots || []);
        } catch (e: unknown) {
            setError(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => { refresh(); }, [refresh]);

    function prefillFromLast() {
        if (!last) return;
        setForm(f => ({
            ...f,
            odometer_km: last.odometer_km?.toString() ?? "",
            fuel_pct: last.fuel_pct?.toString() ?? "",
            tire_kpa_fl: last.tire_kpa_fl?.toString() ?? "",
            tire_kpa_fr: last.tire_kpa_fr?.toString() ?? "",
            tire_kpa_rl: last.tire_kpa_rl?.toString() ?? "",
            tire_kpa_rr: last.tire_kpa_rr?.toString() ?? "",
            outside_temp_c: last.outside_temp_c?.toString() ?? "",
            battery_v: last.battery_v?.toString() ?? "",
            rpm: last.rpm?.toString() ?? "",
            speed_kph: last.speed_kph?.toString() ?? "",
            gear: last.gear ?? "",
            throttle_pct: last.throttle_pct?.toString() ?? "",
            brake_pct: last.brake_pct?.toString() ?? "",
            steering_deg: last.steering_deg?.toString() ?? "",
            engine_temp_c: last.engine_temp_c?.toString() ?? "",
            dash_text: JSON.stringify({ ...defaultDash(), ...(last.dash_lights ?? {}) }, null, 2),
        }));
        const next = defaultDash();
        for (const k of LIGHT_KEYS) {
            const v = last.dash_lights?.[k];
            next[k] = typeof v === "boolean" ? v : false;
        }
        setDash(next);
    }
    function stepTime() {
        const cur = Number(form.t_ms) || 0;
        const next = (last?.t_ms ?? cur) + 1000;
        setForm(f => ({ ...f, t_ms: String(next) }));
    }

    // Build payload from form state (used by create & update)
    function buildPayload(): Snap {
        const manual = parseLightsText(form.dash_text);
        const merged: Record<string, boolean> = { ...manual, ...dash };
        return {
            t_ms: Number(form.t_ms) || 0,
            odometer_km: toNumOrNull(form.odometer_km),
            fuel_pct: toNumOrNull(form.fuel_pct),
            tire_kpa_fl: toNumOrNull(form.tire_kpa_fl),
            tire_kpa_fr: toNumOrNull(form.tire_kpa_fr),
            tire_kpa_rl: toNumOrNull(form.tire_kpa_rl),
            tire_kpa_rr: toNumOrNull(form.tire_kpa_rr),
            outside_temp_c: toNumOrNull(form.outside_temp_c),
            battery_v: toNumOrNull(form.battery_v),
            rpm: toNumOrNull(form.rpm),
            speed_kph: toNumOrNull(form.speed_kph),
            gear: form.gear || null,
            throttle_pct: toNumOrNull(form.throttle_pct),
            brake_pct: toNumOrNull(form.brake_pct),
            steering_deg: toNumOrNull(form.steering_deg),
            engine_temp_c: toNumOrNull(form.engine_temp_c),
            dash_lights: merged,
            gps_lat: null,
            gps_lon: null,
            gps_alt: null,
        };
    }

    async function createSnapshot() {
        try {
            setError(null);
            const payload = buildPayload();
            await axios.post(`/api/v1/sessions/${sessionId}/state/snapshots`, { snapshots: [payload] });
            await refresh();
            setForm(f => ({ ...f, t_ms: String((payload.t_ms || 0) + 1000) }));
        } catch (e: unknown) {
            setError(toErrorMessage(e));
        }
    }

    function startEdit(row: Snap) {
        setEditingId(row.id ?? null);
        setForm({
            t_ms: String(row.t_ms ?? 0),
            odometer_km: row.odometer_km?.toString() ?? "",
            fuel_pct: row.fuel_pct?.toString() ?? "",
            tire_kpa_fl: row.tire_kpa_fl?.toString() ?? "",
            tire_kpa_fr: row.tire_kpa_fr?.toString() ?? "",
            tire_kpa_rl: row.tire_kpa_rl?.toString() ?? "",
            tire_kpa_rr: row.tire_kpa_rr?.toString() ?? "",
            outside_temp_c: row.outside_temp_c?.toString() ?? "",
            battery_v: row.battery_v?.toString() ?? "",
            rpm: row.rpm?.toString() ?? "",
            speed_kph: row.speed_kph?.toString() ?? "",
            gear: row.gear ?? "",
            throttle_pct: row.throttle_pct?.toString() ?? "",
            brake_pct: row.brake_pct?.toString() ?? "",
            steering_deg: row.steering_deg?.toString() ?? "",
            engine_temp_c: row.engine_temp_c?.toString() ?? "",
            dash_text: JSON.stringify({ ...defaultDash(), ...(row.dash_lights ?? {}) }, null, 2),
        });
        const next = defaultDash();
        for (const k of LIGHT_KEYS) {
            const v = row.dash_lights?.[k];
            next[k] = typeof v === "boolean" ? v : false;
        }
        setDash(next);
    }

    async function updateSnapshot() {
        if (!editingId) return;
        try {
            setError(null);
            const payload = buildPayload();
            await axios.put(`/api/v1/sessions/${sessionId}/state/snapshots/${editingId}`, payload);
            await refresh();
            setEditingId(null);
            // advance time for next insert convenience
            setForm(f => ({ ...f, t_ms: String((payload.t_ms || 0) + 1000) }));
        } catch (e: unknown) {
            setError(toErrorMessage(e));
        }
    }

    async function deleteSnapshot(id?: number) {
        if (!id) return;
        if (!confirm("Delete this snapshot?")) return;
        try {
            setError(null);
            await axios.delete(`/api/v1/sessions/${sessionId}/state/snapshots/${id}`);
            // If we were editing this one, cancel edit
            if (editingId === id) setEditingId(null);
            await refresh();
        } catch (e: unknown) {
            setError(toErrorMessage(e));
        }
    }

    function cancelEdit() {
        setEditingId(null);
        setDash(defaultDash());
        setForm(f => ({
            ...f,
            gear: "",
            dash_text: JSON.stringify(defaultDash(), null, 2),
        }));
    }

    const isEditing = editingId !== null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Snapshots</h3>
                <div className="text-xs text-gray-400">{loading ? "Loading…" : `${items.length} rows`}</div>
            </div>

            {/* entry form */}
            <div className="border border-gray-700 rounded-lg p-3 bg-black/20">
                <div className="grid lg:grid-cols-4 md:grid-cols-3 grid-cols-2 gap-2 text-sm">
                    <L label="t_ms"><Input value={form.t_ms} onChange={v => setForm(f => ({ ...f, t_ms: v }))} /></L>
                    <L label="rpm"><Input value={form.rpm} onChange={v => setForm(f => ({ ...f, rpm: v }))} /></L>
                    <L label="speed_kph"><Input value={form.speed_kph} onChange={v => setForm(f => ({ ...f, speed_kph: v }))} /></L>
                    <L label="gear"><Input value={form.gear} onChange={v => setForm(f => ({ ...f, gear: v }))} /></L>

                    <L label="fuel_pct"><Input value={form.fuel_pct} onChange={v => setForm(f => ({ ...f, fuel_pct: v }))} /></L>
                    <L label="odometer_km"><Input value={form.odometer_km} onChange={v => setForm(f => ({ ...f, odometer_km: v }))} /></L>
                    <L label="battery_v"><Input value={form.battery_v} onChange={v => setForm(f => ({ ...f, battery_v: v }))} /></L>
                    <L label="outside_temp_c"><Input value={form.outside_temp_c} onChange={v => setForm(f => ({ ...f, outside_temp_c: v }))} /></L>

                    <L label="engine_temp_c"><Input value={form.engine_temp_c} onChange={v => setForm(f => ({ ...f, engine_temp_c: v }))} /></L>
                    <L label="throttle_pct"><Input value={form.throttle_pct} onChange={v => setForm(f => ({ ...f, throttle_pct: v }))} /></L>
                    <L label="brake_pct"><Input value={form.brake_pct} onChange={v => setForm(f => ({ ...f, brake_pct: v }))} /></L>
                    <L label="steering_deg"><Input value={form.steering_deg} onChange={v => setForm(f => ({ ...f, steering_deg: v }))} /></L>
                </div>

                {/* Signals */}
                <div className="mt-3">
                    <div className="text-xs font-medium text-gray-300 mb-1">Signals &amp; Body</div>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {LIGHT_KEYS.map((k) => (
                            <label key={k} className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={!!dash[k]}
                                    onChange={(e) => {
                                        // optional: auto-toggle both blinkers with hazards
                                        if (k === "HAZARD") {
                                            const on = e.target.checked;
                                            setDash(prev => ({ ...prev, HAZARD: on, LEFT_BLINKER: on, RIGHT_BLINKER: on }));
                                            return;
                                        }
                                        setDash(prev => ({ ...prev, [k]: e.target.checked }));
                                    }}
                                />
                                <span>{labelForKey(k)}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Raw JSON editor */}
                <div className="mt-2">
                    <label className="text-xs font-medium text-gray-300">dash_lights (JSON)
                        <textarea
                            className="w-full font-mono text-xs min-h-24 bg-black/30 border border-gray-700 rounded px-2 py-1 mt-1"
                            value={form.dash_text}
                            onChange={(e) => {
                                const txt = e.target.value;
                                setForm(f => ({ ...f, dash_text: txt }));
                                const obj = parseLightsText(txt);
                                setDash(prev => {
                                    const next = { ...prev };
                                    for (const k of LIGHT_KEYS) {
                                        const v = obj[k];
                                        if (typeof v === "boolean") next[k] = v;
                                    }
                                    return next;
                                });
                            }}
                            placeholder='{"LEFT_BLINKER":true,"RIGHT_BLINKER":false,"HEADLIGHTS":true,"DOORS_LOCKED":false,"TRUNK_OPEN":false,"WINDOW_UP":false,"WINDOW_DOWN":false,"HAZARD":false}'
                        />
                    </label>
                </div>

                <div className="flex gap-2 mt-3 text-gray-50">
                    {!isEditing ? (
                        <>
                            <button onClick={createSnapshot} className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold">Add snapshot</button>
                            <button onClick={prefillFromLast} disabled={!last} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-70">Prefill from last</button>
                            <button onClick={stepTime} className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-sm">t_ms +1000</button>
                        </>
                    ) : (
                        <>
                            <button onClick={updateSnapshot} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold">Save changes</button>
                            <button onClick={cancelEdit} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm">Cancel</button>
                        </>
                    )}
                </div>

                {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
            </div>

            {/* table */}
            <div className="border border-gray-700 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-black/30">
                        <tr>
                            {columns.map(col => (
                                <th key={col.key as string} className="px-2 py-1 text-left border-b border-gray-700 text-gray-300">{col.label}</th>
                            ))}
                            <th className="px-2 py-1 text-left border-b border-gray-700 text-gray-300">Lights</th>
                            <th className="px-2 py-1 text-left border-b border-gray-700 text-gray-300">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((s) => (
                            <tr key={s.id ?? s.t_ms} className="border-b border-gray-800">
                                {columns.map(col => {
                                    const val = s[col.key] as unknown as string | number | null | undefined;
                                    return (
                                        <td key={col.key as string} className="px-2 py-1 whitespace-nowrap">
                                            {val ?? "—"}
                                        </td>
                                    );
                                })}
                                <td className="px-2 py-1 text-xs">
                                    {s.dash_lights
                                        ? Object.entries(s.dash_lights).map(([k, v]) => (
                                            <span key={k} className={`inline-block mr-2 mb-1 px-1.5 py-0.5 rounded ${v ? 'bg-green-700' : 'bg-gray-700'}`}>
                                                {k}:{String(v)}
                                            </span>
                                        ))
                                        : '—'}
                                </td>
                                <td className="px-2 py-1">
                                    <button
                                        className="text-blue-400 underline mr-3"
                                        onClick={() => startEdit(s)}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="text-red-400 underline"
                                        onClick={() => deleteSnapshot(s.id)}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!items.length && (
                            <tr><td colSpan={columns.length + 2} className="px-2 py-3 text-center text-gray-400">No snapshots yet</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col text-xs">
            <span className="text-gray-300 mb-0.5">{label}</span>
            {children}
        </label>
    );
}
function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <input
            className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}
