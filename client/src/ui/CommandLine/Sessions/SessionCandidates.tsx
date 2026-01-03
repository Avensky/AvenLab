import React, { useMemo, useState, useEffect, useRef, Fragment } from 'react';
import axios from 'axios';
import { type Candidate, useSessionCandidates } from '../../../hooks/useSessionCandidates';

/* ------------------------------------------
   Bit-field decoder helpers
   - Assumes byte 0 is the *first* byte in the frame
   - Bit 0 = LSB within a byte (LSB0)
   - Works for fields that can span bytes
   - signed/factor/offset supported
   ------------------------------------------ */

type FieldDef = NonNullable<Candidate['fields']>[number];

function parseHexFrame(input: string): Uint8Array {
    const s = input.trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (s.length === 0) return new Uint8Array([]);
    if (s.length % 2 !== 0) throw new Error('Hex must have an even number of chars');
    const bytes = new Uint8Array(Math.min(8, s.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(bytes[i])) throw new Error('Invalid hex input');
    }
    return bytes;
}

function extractBitsLE(buf: Uint8Array, bitOffset: number, bitLen: number): bigint {
    // Build little-endian bit buffer (byte0 is least-significant 8 bits)
    let word = 0n;
    for (let i = Math.min(buf.length, 8) - 1; i >= 0; i--) {
        word = (word << 8n) | BigInt(buf[i]);
    }
    // In LE mapping above, byte0 sits at bit 0..7, so this shift is correct
    const mask = (1n << BigInt(bitLen)) - 1n;
    return (word >> BigInt(bitOffset)) & mask;
}

function fromTwos(value: bigint, bits: number): bigint {
    const sign = 1n << BigInt(bits - 1);
    return (value & sign) ? (value - (1n << BigInt(bits))) : value;
}

export function decodeFields(frameHex: string, fields: FieldDef[] = []): Record<string, number> {
    const bytes = parseHexFrame(frameHex);
    const out: Record<string, number> = {};
    for (const f of fields) {
        if (typeof f.byte !== 'number') continue;
        const startBit = f.byte * 8 + (f.bit ?? 0);
        const len = Math.max(1, f.len ?? (typeof f.bit === 'number' ? 1 : 8));
        const raw = extractBitsLE(bytes, startBit, len);
        const signed = f.signed ? fromTwos(raw, len) : raw;
        let num = Number(signed);
        if (typeof f.factor === 'number') num = num * f.factor;
        if (typeof f.offset === 'number') num = num + f.offset;
        out[f.label || `b${f.byte}:${f.bit ?? 0}/${len}`] = num;
    }
    return out;
}

/* ------------------------------------------
   Tiny auto-resizing textarea
   ------------------------------------------ */
function AutoTextarea({
    value,
    onChange,
    className = '',
    minRows = 6,
}: {
    value: string;
    onChange: (v: string) => void;
    className?: string;
    minRows?: number;
}) {
    const ref = useRef<HTMLTextAreaElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = '0px';
        el.style.height = Math.max(el.scrollHeight, minRows * 18) + 'px';
    }, [value, minRows]);
    return (
        <textarea
            ref={ref}
            className={`w-full font-mono bg-black/30 border border-gray-700 rounded px-2 py-1 ${className}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

/* ------------------------------------------
   Main component
   ------------------------------------------ */

export default function SessionCandidates({ sessionId }: { sessionId: number }) {
    const { rows, loading, err, upsert } = useSessionCandidates(sessionId);

    // Row being added
    const [draft, setDraft] = useState<Candidate>({
        hex_id: '',
        candidate_type: '',
        confidence: null,
        hz: null,
        frames: null,
        latest_val: null,
    });

    const canAdd = useMemo(
        () => /^0x?[0-9a-fA-F]+$/.test(draft.hex_id || '') && (draft.candidate_type || '').length > 0,
        [draft.hex_id, draft.candidate_type]
    );

    async function addOne() {
        const clean: Candidate = {
            hex_id: draft.hex_id.startsWith('0x') ? draft.hex_id.toUpperCase() : '0x' + draft.hex_id.toUpperCase(),
            candidate_type: draft.candidate_type || null,
            confidence: draft.confidence ?? null,
            hz: draft.hz ?? null,
            frames: draft.frames ?? null,
            latest_val: draft.latest_val ?? null,
            min_val: draft.min_val ?? null,
            max_val: draft.max_val ?? null,
            avg_val: draft.avg_val ?? null,
            first_ms: draft.first_ms ?? null,
            last_ms: draft.last_ms ?? null,
            meta: draft.meta ?? null,
            // byte_labels / fields optional on create
        };
        await upsert([clean]);
        setDraft({ hex_id: '', candidate_type: '', confidence: null, hz: null, frames: null, latest_val: null });
    }

    async function saveRow(r: Candidate) {
        await upsert([r]); // upsert one row (ON CONFLICT ... DO UPDATE at server)
    }

    return (
        <div className="border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-black/30 flex items-center gap-3">
                <span className="font-semibold">Candidates</span>
                {loading && <span className="text-xs text-gray-400">Loading…</span>}
                {err && <span className="text-xs text-red-400">{err}</span>}
            </div>

            {/* Add */}
            <div className="px-3 py-2 grid lg:grid-cols-6 md:grid-cols-4 grid-cols-2 gap-2 border-b border-gray-800 bg-black/10">
                <Field label="hex_id">
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-sm"
                        placeholder="0x3F2"
                        value={draft.hex_id}
                        onChange={(e) => setDraft((d) => ({ ...d, hex_id: e.target.value.trim() }))}
                    />
                </Field>
                <Field label="type">
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-sm"
                        placeholder="LEFT_BLINKER / RPM / ..."
                        value={draft.candidate_type ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, candidate_type: e.target.value }))}
                    />
                </Field>
                <Field label="confidence">
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-sm"
                        type="number"
                        step="0.01"
                        value={draft.confidence ?? ''}
                        onChange={(e) =>
                            setDraft((d) => ({ ...d, confidence: e.target.value === '' ? null : Number(e.target.value) }))
                        }
                    />
                </Field>
                <Field label="hz">
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-sm"
                        type="number"
                        step="0.01"
                        value={draft.hz ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, hz: e.target.value === '' ? null : Number(e.target.value) }))}
                    />
                </Field>
                <Field label="frames">
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-sm"
                        type="number"
                        step="1"
                        value={draft.frames ?? ''}
                        onChange={(e) =>
                            setDraft((d) => ({ ...d, frames: e.target.value === '' ? null : Number(e.target.value) }))
                        }
                    />
                </Field>
                <div className="flex items-end">
                    <button
                        disabled={!canAdd}
                        onClick={addOne}
                        className="px-3 py-1.5 text-gray-300 rounded bg-green-600 hover:bg-green-500 disabled:opacity-50 text-sm font-semibold"
                    >
                        Add / Upsert
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                    <thead className="bg-black/30">
                        <tr>
                            <Th className="w-[130px]">hex_id</Th>
                            <Th className="w-[140px]">type</Th>
                            <Th className="w-[90px]">conf</Th>
                            <Th className="w-[90px]">Hz</Th>
                            <Th className="w-[100px]">frames</Th>
                            <Th className="w-[140px]">latest</Th>
                            <Th className="w-[110px]">min</Th>
                            <Th className="w-[110px]">max</Th>
                            <Th className="w-[110px]">avg</Th>
                            <Th className="w-[150px]">first_ms</Th>
                            <Th className="w-[150px]">last_ms</Th>
                            <Th className="w-[170px]">actions</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <EditableRow key={r.hex_id} sessionId={sessionId} row={r} onSave={saveRow} />
                        ))}
                        {!rows.length && !loading && (
                            <tr>
                                <td colSpan={12} className="px-3 py-3 text-center text-gray-400">
                                    No candidates yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ------------------------------------------
   Row (now returns two <tr>s when "Advanced" is open)
   - Bigger inputs (py-1.5), table-fixed with widths
   - Advanced row overflows under the main row
   - Advanced editors auto-grow
   - Decode preview included
   ------------------------------------------ */
function EditableRow({
    sessionId,
    row,
    onSave,
}: {
    sessionId: number;
    row: Candidate;
    onSave: (r: Candidate) => void;
}) {
    const [edit, setEdit] = useState<Candidate>(row);
    const { refresh } = useSessionCandidates(sessionId);

    function safeParse<T>(txt: string, fallback: T): T {
        try {
            return txt.trim() ? (JSON.parse(txt) as T) : fallback;
        } catch {
            return fallback;
        }
    }

    const [open, setOpen] = useState(false);
    const [byteTxt, setByteTxt] = useState(() => JSON.stringify(row.byte_labels ?? [], null, 2));
    const [fieldsTxt, setFieldsTxt] = useState(() => JSON.stringify(row.fields ?? [], null, 2));
    const [hexInput, setHexInput] = useState(''); // for decode preview
    const [decoded, setDecoded] = useState<Record<string, number>>({});

    useEffect(() => {
        try {
            const defs = safeParse<FieldDef[]>(fieldsTxt, []);
            const out = decodeFields(hexInput, defs);
            setDecoded(out);
        } catch {
            setDecoded({});
        }
    }, [hexInput, fieldsTxt]);

    return (
        <Fragment>
            {/* main row */}
            <tr className="border-b border-gray-800 align-top ">
                <Td className="font-mono break-all">{edit.hex_id}</Td>
                <Td>
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5"
                        value={edit.candidate_type ?? ''}
                        onChange={(e) => setEdit({ ...edit, candidate_type: e.target.value })}
                    />
                </Td>
                <Td>
                    <Num v={edit.confidence} onChange={(v) => setEdit({ ...edit, confidence: v })} />
                </Td>
                <Td>
                    <Num v={edit.hz} onChange={(v) => setEdit({ ...edit, hz: v })} />
                </Td>
                <Td>
                    <Int v={edit.frames} onChange={(v) => setEdit({ ...edit, frames: v })} />
                </Td>
                <Td>
                    <input
                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5"
                        value={edit.latest_val ?? ''}
                        onChange={(e) => setEdit({ ...edit, latest_val: e.target.value || null })}
                    />
                </Td>
                <Td>
                    <Num v={edit.min_val} onChange={(v) => setEdit({ ...edit, min_val: v })} />
                </Td>
                <Td>
                    <Num v={edit.max_val} onChange={(v) => setEdit({ ...edit, max_val: v })} />
                </Td>
                <Td>
                    <Num v={edit.avg_val} onChange={(v) => setEdit({ ...edit, avg_val: v })} />
                </Td>
                <Td>
                    <Int v={edit.first_ms} onChange={(v) => setEdit({ ...edit, first_ms: v })} />
                </Td>
                <Td>
                    <Int v={edit.last_ms} onChange={(v) => setEdit({ ...edit, last_ms: v })} />
                </Td>
                <Td className="space-x-2">
                    <button
                        className="px-2 py-1.5 text-gray-300 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold"
                        onClick={() =>
                            onSave({
                                ...edit,
                                byte_labels: safeParse(byteTxt, [] as Candidate['byte_labels']),
                                fields: safeParse(fieldsTxt, [] as Candidate['fields']),
                            })
                        }
                    >
                        Save
                    </button>
                    <button
                        className="px-2 py-1.5 text-gray-300 rounded bg-red-700 hover:bg-red-600 text-xs font-semibold"
                        onClick={async () => {
                            if (!confirm(`Delete ${edit.hex_id}?`)) return;
                            await axios.delete(
                                `/api/v1/sessions/${sessionId}/state/candidates/${encodeURIComponent(edit.hex_id)}`
                            );
                            await refresh();
                        }}
                    >
                        Delete
                    </button>
                    <button
                        className="px-2 py-1.5 text-gray-300 rounded bg-slate-700 hover:bg-slate-600 text-xs"
                        onClick={() => setOpen((o) => !o)}
                    >
                        {open ? 'Hide' : 'Advanced'}
                    </button>
                </Td>
            </tr>

            {/* overflow/advanced row */}
            {open && (
                <tr className="border-b border-gray-900 bg-black/15">
                    <td colSpan={12} className="px-3 py-2">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col text-xs">
                                <span className="text-gray-300 mb-1">byte_labels (JSON)</span>
                                <AutoTextarea
                                    minRows={8}
                                    className="min-h-[10rem]"
                                    value={byteTxt}
                                    onChange={setByteTxt}
                                />
                                <span className="text-[11px] text-gray-400 mt-1">
                                    Either an array (index = byte) or an object map.
                                </span>
                            </div>
                            <div className="flex flex-col text-xs">
                                <span className="text-gray-300 mb-1">fields (JSON)</span>
                                <AutoTextarea
                                    minRows={10}
                                    className="min-h-[12rem]"
                                    value={fieldsTxt}
                                    onChange={setFieldsTxt}
                                />
                                <span className="text-[11px] text-gray-400 mt-1">
                                    Example: <code>{`[{"label":"LEFT_BLINKER","byte":0,"bit":0,"len":1},{"label":"RPM","byte":1,"len":16,"factor":0.25,"unit":"rpm"}]`}</code>
                                </span>
                            </div>
                        </div>

                        {/* Decode preview */}
                        <div className="mt-3 border-t border-gray-800 pt-3">
                            <div className="text-xs font-semibold text-gray-300 mb-1">Decode Preview</div>
                            <div className="grid md:grid-cols-4 sm:grid-cols-2 grid-cols-1 gap-2">
                                <label className="flex flex-col text-xs md:col-span-2">
                                    <span className="text-gray-300 mb-1">Frame (hex)</span>
                                    <input
                                        className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5 font-mono"
                                        placeholder="0x1122334455667788"
                                        value={hexInput}
                                        onChange={(e) => setHexInput(e.target.value)}
                                    />
                                </label>
                                <div className="md:col-span-2">
                                    <div className="text-[11px] text-gray-400 mb-1">Decoded</div>
                                    <div className="flex flex-wrap gap-1">
                                        {Object.keys(decoded).length === 0 ? (
                                            <span className="text-xs text-gray-500">—</span>
                                        ) : (
                                            Object.entries(decoded).map(([k, v]) => (
                                                <span key={k} className="text-xs px-2 py-1 rounded bg-gray-800">
                                                    {k}: {v}
                                                </span>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-2">
                                Notes: byte 0 → first byte. Bit 0 → LSB. Fields can span bytes; signed/factor/offset supported.
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </Fragment>
    );
}

/* ------------------------------------------ */

function Num({ v, onChange }: { v?: number | null; onChange: (n: number | null) => void }) {
    return (
        <input
            className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5"
            type="number"
            step="0.01"
            value={v ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
    );
}
function Int({ v, onChange }: { v?: number | null; onChange: (n: number | null) => void }) {
    return (
        <input
            className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1.5"
            type="number"
            step="1"
            value={v ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
    );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col text-xs">
            <span className="text-gray-300 mb-0.5">{label}</span>
            {children}
        </label>
    );
}
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <th className={`px-2 py-1 text-left border-b border-gray-700 text-gray-300 ${className}`}>{children}</th>
    );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <td className={`px-2 py-1 align-top ${className}`}>{children}</td>;
}
