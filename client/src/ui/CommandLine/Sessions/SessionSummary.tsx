import { useEffect, useMemo, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { useStore } from '../../../store';
import { useSessionMarks } from '../../../hooks/useSessionMarks';

// ---- types ----
type VehicleRow = {
    id: number;
    vehicle_id: number;
    alias: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
};

type FreqRow = {
    hex_id: string;
    frames: number;
    first_ts: number;
    last_ts: number;
    hz: number;
    label: string | null;
};

// was: const TABS = [...] as const;  // ❌ value unused
type TabType = 'summary' | 'candidates' | 'logs' | 'raw' | 'playback' | 'snapshots';
type SourceType = 'raw' | 'logs';
type OrderType = 'hz_desc' | 'hz_asc' | 'id_asc' | 'id_desc';

interface Props {
    setActiveTab: (tab: TabType) => void;
}

const fmtVeh = (v: VehicleRow) =>
    v.alias || [v.make, v.model, v.year ?? ''].filter(Boolean).join(' ');

function toErrorMessage(e: unknown): string {
    const ax = e as AxiosError<{ error?: string }>;
    return ax?.response?.data?.error || ax?.message || 'Request failed';
}

export const SessionSummary = ({ setActiveTab }: Props) => {
    const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
    const [vehId, setVehId] = useState<number | ''>('');
    const [vehLabel, setVehLabel] = useState<string>('');
    const [savingVeh, setSavingVeh] = useState(false);

    const [source, setSource] = useState<SourceType>('raw');
    const [order, setOrder] = useState<OrderType>('hz_desc');
    const [rows, setRows] = useState<FreqRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [loadingVehicles, setLoadingVehicles] = useState(false);

    // Load vehicles once
    useEffect(() => {
        setLoadingVehicles(true);
        axios
            .get('/api/v1/vehicles')
            .then((res) => setVehicles(res.data?.vehicles || []))
            .catch((e: unknown) =>
                console.error('Failed to load vehicles', toErrorMessage(e))
            )
            .finally(() => setLoadingVehicles(false));
    }, []);

    const {
        databaseSessions,
        selectedSessionId,
        fetchSessions,
    } = useStore();
    const marks = useSessionMarks(selectedSessionId);

    const selected = useMemo(
        () => databaseSessions.find((s) => s.id === selectedSessionId),
        [databaseSessions, selectedSessionId]
    );

    // Prefill vehicle selector/label from the selected session
    useEffect(() => {
        if (!selected) return;
        setVehId(selected.vehicle_id ?? '');
        setVehLabel(selected.vehicle ?? '');
    }, [selected]);

    // Save vehicle selection/label
    async function saveVehicle() {
        if (!selectedSessionId) return;
        setSavingVeh(true);
        try {
            await axios.put(`/api/v1/sessions/${selectedSessionId}/vehicle`, {
                vehicle_id: vehId === '' ? null : Number(vehId),
                vehicle: vehLabel || undefined,
            });
            await fetchSessions();
        } catch (e: unknown) {
            console.error('save vehicle failed', toErrorMessage(e));
        } finally {
            setSavingVeh(false);
        }
    }

    useEffect(() => {
        if (!selectedSessionId) return;
        setLoading(true);
        setErr(null);
        axios
            .get(`/api/v1/sessions/${selectedSessionId}/id-frequencies`, {
                params: { source, order },
            })
            .then((res) => setRows(res.data?.rows || []))
            .catch((e: unknown) => setErr(toErrorMessage(e)))
            .finally(() => setLoading(false));
    }, [selectedSessionId, source, order]);

    // Totals
    const totalFrames = useMemo(
        () => rows.reduce((a, r) => a + (r.frames || 0), 0),
        [rows]
    );
    const uniqueIds = rows.length; // ✅ now used below

    // Clickable headers to toggle sort
    const toggleSortByHz = () =>
        setOrder((prev) => (prev === 'hz_desc' ? 'hz_asc' : 'hz_desc'));
    const toggleSortById = () =>
        setOrder((prev) => (prev === 'id_asc' ? 'id_desc' : 'id_asc'));

    if (!selectedSessionId) return null;

    // at top (already have axios imported in your version)
    const normHex = (h: string) => (h?.startsWith('0x') ? h.toUpperCase() : ('0x' + h).toUpperCase());

    async function promoteFromFreq(r: FreqRow, sessionId: number) {
        await axios.post(`/api/v1/sessions/${sessionId}/state/candidates`, {
            candidates: [{
                hex_id: normHex(r.hex_id),
                candidate_type: r.label || 'unknown',
                frames: r.frames ?? null,
                hz: r.hz != null ? Number(r.hz) : null,
                first_ms: r.first_ts ?? null,
                last_ms: r.last_ts ?? null,
                fields: [
                    // example: whole-byte flag in byte 0
                    { label: r.label || 'FLAG', byte: 0, bit: 0, len: 1 }
                ],
                meta: { source: 'id-frequencies' }
            }]
        });

    }


    return (
        <div className="text-sm">
            {/* Header */}
            <div>
                <p className="font-semibold">🧾 Session Summary</p>
                <ul className="list-disc ml-5 text-gray-50">
                    <li>
                        Session: #{selectedSessionId}{' '}
                        {selected?.label ? `· ${selected.label}` : ''}
                    </li>
                    <li>
                        Vehicle: {selected?.vehicle ? selected.vehicle : '—'}{' '}
                        {selected?.vehicle_id ? `(id ${selected.vehicle_id})` : ''}
                    </li>
                    <li>
                        Start:{' '}
                        {selected?.start_time
                            ? new Date(selected.start_time).toLocaleString()
                            : 'N/A'}
                    </li>
                    <li>Total Frames: {totalFrames}</li>
                    <li>Unique Hex IDs: {uniqueIds}</li> {/* ✅ uses uniqueIds */}
                </ul>
            </div>

            {/* Vehicle editor */}
            <div className="">
                <div className="py-1 font-semibold">Change Vehicle</div>
                <div className="border rounded p-2 grid grid-cols-1 md:grid-cols-3 gap-2 items-center text-gray-50">
                    <label className="text-xs opacity-80">Select</label>
                    <select
                        className="bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm md:col-span-2"
                        value={vehId === '' ? '' : Number(vehId)}
                        onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setVehId(val);
                            if (val !== '' && !vehLabel) {
                                const v = vehicles.find((x) => x.id === val);
                                if (v) setVehLabel(fmtVeh(v));
                            }
                        }}
                    >
                        <option value="">— none —</option>
                        {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                                {fmtVeh(v)}
                            </option>
                        ))}
                    </select>
                    {loadingVehicles && (
                        <span className="text-xs text-gray-400 md:col-start-3">
                            Loading vehicles…
                        </span>
                    )}
                    <label className="text-xs opacity-80">Custom label</label>
                    <input
                        className="bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm md:col-span-2"
                        value={vehLabel}
                        onChange={(e) => setVehLabel(e.target.value)}
                        placeholder="e.g. FR-S, Civic, '2015 Scion FR-S'"
                    />

                    <div className="md:col-start-3 flex gap-2">
                        <button
                            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold disabled:opacity-50"
                            onClick={saveVehicle}
                            disabled={savingVeh}
                        >
                            {savingVeh ? 'Saving…' : 'Save vehicle'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Source/order */}
            <div className="flex items-center gap-3 event-success my-1">
                <label className="text-xs opacity-80">SOURCE</label>
                <select
                    className="bg-black/30 border border-gray-700 text-gray-50 rounded px-2 py-1 text-xs"
                    value={source}
                    onChange={(e) => setSource(e.target.value as SourceType)}
                >
                    <option value="raw">raw (from can_raw)</option>
                    <option value="logs">logs (decoded frames)</option>
                </select>

                <label className="text-xs opacity-80">ORDER</label>
                <select
                    className="bg-black/30 border border-gray-700 text-gray-50 rounded px-2 py-1 text-xs"
                    value={order}
                    onChange={(e) => setOrder(e.target.value as OrderType)}
                >
                    <option value="hz_desc">frequency ↓</option>
                    <option value="hz_asc">frequency ↑</option>
                    <option value="id_asc">hex id ↑</option>
                    <option value="id_desc">hex id ↓</option>
                </select>

                {loading && <span className="text-xs text-gray-400">Loading…</span>}
                {err && <span className="text-xs text-red-400">{err}</span>}
            </div>

            {/* frequencies */}
            <div className="event-info">
                <p className="py-1 font-semibold text-blue-600">📡 IDs by frequency</p>
                <div className="overflow-auto max-h-[50vh] border-b rounded">
                    <table className="w-full text-left text-sm table-auto">
                        <thead className="event-success border-b sticky top-0 bg-black/60 backdrop-blur">
                            <tr>
                                <th
                                    className="px-2 py-1 border cursor-pointer"
                                    onClick={toggleSortById}
                                >
                                    Hex ID{' '} {order.startsWith('id_') ? order.endsWith('asc') ? '↑' : '↓' : ''}
                                </th>
                                <th className="px-2 py-1 border">Label</th>
                                <th className="px-2 py-1 border">Frames</th>
                                <th
                                    className="px-2 py-1 border cursor-pointer"
                                    onClick={toggleSortByHz}
                                >
                                    Frequency (Hz){' '}{order.startsWith('hz_') ? order.endsWith('asc') ? '↑' : '↓' : ''}
                                </th>
                                <th className="px-2 py-1 border">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (

                                <tr key={r.hex_id} className="border-b">
                                    <td className="px-2 py-1 font-mono border">
                                        {r.hex_id?.toUpperCase?.() || r.hex_id}
                                    </td>
                                    <td className="px-2 py-1 border">{r.label || '—'}</td>
                                    <td className="px-2 py-1 border">{r.frames}</td>
                                    <td className="px-2 py-1 border">{r.hz}</td>
                                    <td className="px-2 py-1 border">
                                        <button
                                            className="text-xs px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
                                            onClick={() => promoteFromFreq(r, selectedSessionId)}
                                        >Promote</button>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && !loading && (
                                <tr>
                                    <td
                                        className="px-2 py-2 text-center text-gray-400"
                                        colSpan={4}
                                    >
                                        No data
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Marks */}
            <div className="">
                <div className="p-1 font-semibold">Marks</div>
                <div className="border rounded max-h-40 overflow-auto">
                    <table className="event-info w-full text-left text-xs">
                        <thead className="event-success border-b">
                            <tr>
                                <th className="px-2 py-1">t (s)</th>
                                <th className="px-2 py-1">type</th>
                                <th className="px-2 py-1">label</th>
                                <th className="px-2 py-1">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {marks.map((m) => (
                                <tr key={m.id} className="border-t border-gray-700">
                                    <td className="px-2 py-1">{m.t_ms / 1000}</td>
                                    <td className="px-2 py-1">{m.type}</td>
                                    <td className="px-2 py-1">{m.label || '—'}</td>
                                    <td className="px-2 py-1">
                                        <button
                                            className="text-blue-400 underline p-1"
                                            onClick={() => {
                                                useStore.setState({ activeView: 'viewPlayback' });
                                                setActiveTab('playback');
                                                requestAnimationFrame(() => {
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                });
                                            }}
                                        >
                                            Jump
                                        </button>
                                        <button
                                            className="text-yellow-400 underline p-1"
                                            onClick={async () => {
                                                const newLabel =
                                                    prompt('New label?', m.label || '') ?? m.label;
                                                await axios.put(
                                                    `/api/v1/sessions/${selectedSessionId}/marks/${m.id}`,
                                                    { label: newLabel }
                                                );
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="text-red-400 underline p-1"
                                            onClick={async () => {
                                                if (!confirm('Delete this mark?')) return;
                                                await axios.delete(
                                                    `/api/v1/sessions/${selectedSessionId}/marks/${m.id}`
                                                );
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!marks.length && (
                                <tr>
                                    <td className="px-2 py-2 opacity-60" colSpan={4}>
                                        No marks
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
