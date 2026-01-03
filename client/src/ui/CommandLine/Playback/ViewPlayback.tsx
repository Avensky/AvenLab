import React, { useState, useEffect, useRef, useMemo } from 'react';
import { normalizeToCanFrames } from '../../../utils/parseFrame';
import { useStore, type CanFrame, type NormalFrame } from '../../../store';
import { HighlightedData } from '../HighlightedData';
import { TableVirtuoso } from 'react-virtuoso';
import ComparePayloads from './ComparePayloads';
import CompareIds from './CompareIds';
import { useSessionMarks } from '../../../hooks/useSessionMarks';

interface Props {
    type: string;
    isPlaying: boolean;
    onScrub: (time: number) => void;
}
type IdCompare = {
    added: string[];
    removed: string[];
    common: string[];
};

type PayloadChange = {
    id: string;
    changedBytes: number;
    a: string;
    b: string
};

type RateChange = {
    id: string;
    rateA: number;
    rateB: number;
    delta: number
};


export default function ViewPlayback({ type, isPlaying, onScrub }: Props) {
    // state
    const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [compare, setCompare] = useState<IdCompare | null>(null);
    const [payloadChanges, setPayloadChanges] = useState<PayloadChange[]>([]);
    const [rateChanges, setRateChanges] = useState<RateChange[]>([]);
    // toggles for mini tables
    const [showIds, setShowIds] = useState(false);
    const [showPayloads, setShowPayloads] = useState(false);
    const [showRates, setShowRates] = useState(false);

    //variables
    const frames = useStore(state => state.frames);
    const databaseTables = useStore(state => state.databaseTables);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const playbackSpeed = useStore(state => state.playbackSpeed);
    const isLooping = useStore(state => state.isLooping);
    const playbackIndex = useStore(state => state.playbackIndex);
    const playbackTolerance = useStore(state => state.playbackTolerance);

    const selectedSnapshotA = useStore(state => state.selectedSnapshotA);
    const selectedSnapshotB = useStore(state => state.selectedSnapshotB);

    // ViewPlayback.tsx additions
    const firstTs = useStore(s => s.groupedFirstTimestamps) || [];

    // Prefer selectedSessionId (DB view); fall back to currentSessionId (live)
    const selectedId = useStore(s => s.selectedSessionId);
    const liveId = useStore(s => s.currentSessionId);
    const sessionId = selectedId ?? liveId;

    const marks = useSessionMarks(sessionId);

    const colorFor = (t: string) => t === 'idle' ? '#4ade80' : t === 'action' ? '#facc15' : '#60a5fa';

    // mark -> nearest group index
    const markIndices = useMemo(() => {
        return marks.map(m => {
            let best = 0, bestDiff = Infinity;
            for (let i = 0; i < firstTs.length; i++) {
                const diff = Math.abs((m.t_ms || 0) - (firstTs[i] * 1000));
                if (diff < bestDiff) { best = i; bestDiff = diff; }
            }
            return { m, idx: best };
        });
    }, [marks, firstTs]);


    // Get data based on type/source
    const filtered: CanFrame[] = useMemo(() => {
        const store = useStore.getState();
        const safeNormalize = (frames?: NormalFrame[]) => normalizeToCanFrames(frames ?? []);
        switch (type) {
            case "frames": return store.getFilteredFrames(store.frames);
            case "deltas": return store.getFilteredFrames(safeNormalize(store.databaseTables?.deltas));
            case "logs": return store.getFilteredFrames(safeNormalize(store.databaseTables?.logs));
            case "raw": return store.getFilteredFrames(safeNormalize(store.databaseTables?.raw));
            default: return [];
        }
    }, [type, frames, databaseTables, useStore(state => state.filters)]);

    // Helper: extract unique Hex IDs from a slice (or any CanFrame[])
    const idsFromFrames = (frames: CanFrame[]) => {
        const s = new Set<string>();
        for (const f of frames) s.add(f[0]); // f[0] is HexID
        return s;
    };

    useEffect(() => {
        if (filtered.length > 0 && Array.isArray(filtered[0])) {
            useStore.getState().setByteVolatility(filtered);
        }
    }, [filtered]);

    const groupedFrames = useMemo(() => {
        // Create grouped frames based on filtered/sorted data
        if (filtered.length === 0) return [];

        const sorted = [...filtered].sort((a, b) => a[5] - b[5]);

        const groups: CanFrame[][] = [];
        let currentGroup: CanFrame[] = [sorted[0]];
        let currentTime = sorted[0][5];

        for (let i = 1; i < sorted.length; i++) {
            const frame = sorted[i];
            if (Math.abs(frame[5] - currentTime) <= playbackTolerance) {
                currentGroup.push(frame);
            } else {
                groups.push(currentGroup);
                currentGroup = [frame];
                currentTime = frame[5];
            }
        }

        if (currentGroup.length > 0) groups.push(currentGroup);
        return groups;
    }, [filtered, playbackTolerance]);

    useEffect(() => {
        const firstTs = groupedFrames.map(g => g[0]?.[5] ?? 0);
        useStore.getState().setGroupedPlaybackMeta(groupedFrames.length, firstTs);

        // keep index sane on data change
        useStore.setState({ playbackIndex: 0 });
        setCurrentIndex(0);
    }, [groupedFrames.length]);

    useEffect(() => {
        setCurrentIndex(playbackIndex);
    }, [playbackIndex]);

    useEffect(() => {
        // when the group count changes, clamp/reset indices
        useStore.setState({ playbackIndex: 0 });
        setCurrentIndex(0);
    }, [groupedFrames.length]);

    useEffect(() => {
        // Clamp currentIndex whenever it drifts out of range
        if (currentIndex >= groupedFrames.length) {
            const last = Math.max(0, groupedFrames.length - 1);
            setCurrentIndex(last);
            useStore.setState({ playbackIndex: last });
        }
    }, [currentIndex, groupedFrames.length]);

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        if (isPlaying) {
            intervalRef.current = setInterval(() => {
                useStore.setState(state => {
                    const nextIndex = state.playbackIndex + 1;
                    if (nextIndex >= groupedFrames.length) {
                        return isLooping
                            ? { playbackIndex: 0 }
                            : { isPlaying: false, playbackIndex: groupedFrames.length - 1 };
                    }
                    return { playbackIndex: nextIndex };
                });
            }, 1000 / playbackSpeed);
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isPlaying, isLooping, playbackSpeed, groupedFrames.length]);

    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newIndex = parseInt(e.target.value, 10);
        setCurrentIndex(newIndex);
        useStore.setState({ playbackIndex: newIndex });
        onScrub(newIndex);
    };

    const currentFrames = groupedFrames[currentIndex] || [];
    const [flashA, setFlashA] = useState(false);
    const [flashB, setFlashB] = useState(false);

    const loadSnapshot = (slot: 'A' | 'B') => {
        const slice = groupedFrames[currentIndex] || [];
        if (!slice.length) return;

        const store = useStore.getState();
        store.setSnapshot(slot, slice);
        useStore.setState(slot === 'A' ? { selectedSnapshotA: true } : { selectedSnapshotB: true });

        // Trigger flash animation
        if (slot === 'A') {
            setFlashA(true);
            setTimeout(() => setFlashA(false), 300); // reset after animation
        }
        else if (slot === 'B') {
            setFlashB(true);
            setTimeout(() => setFlashB(false), 300);
        }
        // If any panels are active, recompute immediately
        if (showIds) compareSnapshotsIds();
        if (showPayloads) compareSnapshotsPayloads();
        if (showRates) compareSnapshotsRates();
    };

    const getAB = () => {
        const { A, B } = useStore.getState().snapshots;
        const snapA = Array.isArray(A) ? (A as CanFrame[]) : [];
        const snapB = Array.isArray(B) ? (B as CanFrame[]) : [];
        return { snapA, snapB };
    };

    // Compare IDs between Snapshot A (Idle) and Snapshot B (Action)
    const compareSnapshotsIds = () => {
        const { snapA, snapB } = getAB();
        if (!snapA || !snapA.length || !snapB || !snapB.length) {
            setCompare(null);
            return;
        }

        const a = idsFromFrames(snapA);
        const b = idsFromFrames(snapB);

        const added: string[] = [];
        const removed: string[] = [];
        const common: string[] = [];

        for (const id of b) (a.has(id) ? common : added).push(id);
        for (const id of a) if (!b.has(id)) removed.push(id);

        // keep it tidy: sort for display
        added.sort(); removed.sort(); common.sort();
        setCompare({ added, removed, common });
    };

    // --- helpers ---
    const bytesFromHex = (s: string) => {
        // accept "AA BB", "AA,BB", "aa bb", etc.
        return s
            .replace(/[,]/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(x => x.toUpperCase());
    };

    function normalizePayload(p: unknown): string {
        if (Array.isArray(p)) {
            // number[] or string[] -> "AA BB ..."
            return (p as Array<number | string>)
                .map(b => (typeof b === 'number' ? b.toString(16).padStart(2, '0') : String(b)))
                .join(' ')
                .replace(/[,]/g, ' ')
                .trim()
                .toUpperCase();
        }
        if (typeof p === 'string') {
            return p.replace(/[,]/g, ' ').trim().toUpperCase();
        }
        return '';
    }

    const latestPayloadById = (frames: CanFrame[]) => {
        const m = new Map<string, { t: number; payload: string }>();

        for (const frame of frames) {
            const id = frame[0];
            const t = Number(frame[5]) || 0;
            const payload = normalizePayload(frame[6] as unknown);

            const prev = m.get(id);
            if (!prev || t >= prev.t) m.set(id, { t, payload });
        }

        return new Map(Array.from(m.entries()).map(([id, v]) => [id, v.payload]));
    };

    const diffByteCounts = (a: string, b: string) => {
        const A = bytesFromHex(a), B = bytesFromHex(b);
        const len = Math.max(A.length, B.length);
        let changed = 0;
        for (let i = 0; i < len; i++) if (A[i] !== B[i]) changed++;
        return { changed, lenA: A.length, lenB: B.length };
    };

    const ratesById = (frames: CanFrame[]) => {
        if (!frames.length) return new Map<string, number>();
        const counts = new Map<string, number>();
        let minT = Infinity, maxT = -Infinity;
        for (const f of frames) {
            const id = f[0];
            const t = Number(f[5]) || 0;
            minT = Math.min(minT, t);
            maxT = Math.max(maxT, t);
            counts.set(id, (counts.get(id) || 0) + 1);
        }
        const dur = Math.max(1e-6, maxT - minT); // guard purely degenerate case
        return new Map(Array.from(counts.entries()).map(([id, cnt]) => [id, cnt / dur]));
    };

    // ---- payload compare ----
    const compareSnapshotsPayloads = () => {
        const { snapA, snapB } = getAB();
        if (!snapA.length || !snapB.length) {
            setPayloadChanges([]);
            return;
        }

        const lastA = latestPayloadById(snapA);
        const lastB = latestPayloadById(snapB);

        const allIds = new Set<string>([...lastA.keys(), ...lastB.keys()]);
        const changes: PayloadChange[] = [];
        for (const id of allIds) {
            const pa = lastA.get(id) ?? '';
            const pb = lastB.get(id) ?? '';
            if (pa === '' && pb === '') continue;
            if (pa !== pb) {
                const { changed } = diffByteCounts(pa, pb);
                changes.push({ id, changedBytes: changed, a: pa, b: pb });
            }
        }
        // sort most-changed first
        changes.sort((x, y) => y.changedBytes - x.changedBytes || x.id.localeCompare(y.id));
        setPayloadChanges(changes);
    };

    // ---- rate compare ----
    // helper: get frames in a time window from the current source
    const framesInWindow = (all: CanFrame[], centerSec: number, windowSec = 1.0) => {
        const half = windowSec / 2;
        const start = centerSec - half;
        const end = centerSec + half;
        // assumes frame[5] is in seconds; if it's ms, convert here: Number(f[5]) / 1000
        return all.filter(f => {
            const t = Number(f[5]) || 0;
            return t >= start && t <= end;
        });
    };

    // compute slice center (or first timestamp) for a snapshot
    const sliceCenter = (slice: CanFrame[]) => {
        if (!slice.length) return 0;
        // use mean time of the slice to be robust
        const sum = slice.reduce((acc, f) => acc + (Number(f[5]) || 0), 0);
        return sum / slice.length;
    };

    // ---- rate compare over window ----

    const compareSnapshotsRates = () => {
        const { snapA, snapB } = getAB();
        if (!snapA.length || !snapB.length) { setRateChanges([]); return; }

        // choose window length; 1s is a good start for 30Hz signals
        const WINDOW_SEC = 1.0;

        // pick the current source frames (same as table) so rates reflect visible dataset
        const all = filtered; // already normalized & filtered by your Filter.tsx

        const tA = sliceCenter(snapA);
        const tB = sliceCenter(snapB);

        const winA = framesInWindow(all, tA, WINDOW_SEC);
        const winB = framesInWindow(all, tB, WINDOW_SEC);

        const rA = ratesById(winA);
        const rB = ratesById(winB);

        const allIds = new Set<string>([...rA.keys(), ...rB.keys()]);
        const changes: RateChange[] = [];
        for (const id of allIds) {
            const a = rA.get(id) ?? 0;
            const b = rB.get(id) ?? 0;
            if (a === 0 && b === 0) continue;
            changes.push({ id, rateA: a, rateB: b, delta: b - a });
        }
        // sort by absolute change desc for quick scan
        changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.id.localeCompare(y.id));
        setRateChanges(changes);
    };

    // Clear all compare panels + data
    const clearAllPanels = () => {
        setShowIds(false);
        setShowPayloads(false);
        setShowRates(false);
        setCompare(null);
        setPayloadChanges([]);
        setRateChanges([]);
    };

    // watch snapshots so we recompute when they change from anywhere
    const snapshots = useStore(s => s.snapshots);
    useEffect(() => {
        if (showIds) compareSnapshotsIds();
        if (showPayloads) compareSnapshotsPayloads();
        if (showRates) compareSnapshotsRates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshots]);

    return (
        <div className="w-full h-full">

            {/* Header: snapshot actions */}
            <div className="flex justify-between event-success ">
                <span className='flex items-center text-sm'>Time slice {currentIndex + 1} / {groupedFrames.length}</span>
                <div className="flex items-center  justify-end gap-1 text-nowrap">
                    <button
                        className={`border-2 small border-solid border-transparent px-1 w-fit  
                            ${selectedSnapshotA ? 'active-snapshot' : ''}
                            ${flashA ? 'flash' : ''}
                        `}
                        onClick={() => {
                            loadSnapshot('A')
                            // if (selectedSnapshotA) {
                            //     useStore.getState().clearSnapshot('A');
                            //     useStore.setState({ selectedSnapshotA: false });
                            // } else { loadSnapshot('A') }
                        }}
                        // disabled={!groupedFrames.length}
                        title="Load Snapshot A with current time slice"
                    >Load A</button>
                    <button
                        className={`border-2 border-solid border-transparent px-1  w-fit  
                            ${selectedSnapshotB ? 'active-snapshot' : ''}
                            ${flashB ? 'flash' : ''}
                        `}
                        onClick={() => {
                            loadSnapshot('B')
                            // if (selectedSnapshotB) {
                            //     useStore.getState().clearSnapshot('B');
                            //     useStore.setState({ selectedSnapshotB: false });
                            // } else { loadSnapshot('B') }
                        }}
                        // disabled={!groupedFrames.length}
                        title="Load Snapshot B with current time slice"
                    >Load B</button>

                    <button
                        className={`border-2 border-solid border-transparent px-1 w-fit ${showIds ? 'active-snapshot' : ''}`}
                        onClick={() => {
                            const next = !showIds;
                            setShowIds(next);
                            if (next) compareSnapshotsIds(); else setCompare(null);
                        }}
                        title="Compare IDs between A and B"
                    >
                        Compare IDs
                    </button>

                    <button
                        className={`border-2 border-solid border-transparent px-1 w-fit ${showPayloads ? 'active-snapshot' : ''}`}
                        onClick={() => {
                            const next = !showPayloads;
                            setShowPayloads(next);
                            if (next) compareSnapshotsPayloads(); else setPayloadChanges([]);
                        }}
                    >
                        Compare Payloads
                    </button>

                    <button
                        className={`border-2 border-solid border-transparent px-1 w-fit ${showRates ? 'active-snapshot' : ''}`}
                        onClick={() => {
                            const next = !showRates;
                            setShowRates(next);
                            if (next) compareSnapshotsRates(); else setRateChanges([]);
                        }}
                    >
                        Compare Rates
                    </button>

                    <button
                        className="border-2 border-solid border-transparent px-1 w-fit"
                        title="Hide all compare panels and clear results"
                        onClick={clearAllPanels}
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* // render ticks above the range input */}
            <div className="relative">
                <input
                    type="range"
                    min={0}
                    max={Math.max(0, groupedFrames.length - 1)}
                    value={currentIndex}
                    onChange={handleScrub}
                    className="w-full"
                />
                <div className="pointer-events-none absolute left-0 right-0 top-0 h-0">
                    {markIndices.map(({ m, idx }) => (
                        <button
                            key={m.id}
                            title={`Mark @ ${(m.t_ms / 1000).toFixed(2)}s`}
                            className="pointer-events-auto absolute -translate-x-1/2 translate-y-0.5 w-0.5 h-3 bg-yellow-300"
                            style={{
                                left: `${(idx / (Math.max(firstTs.length - 1, 1))) * 100}%`,
                                backgroundColor: colorFor(m.type)
                            }}
                            onClick={() => useStore.setState({ playbackIndex: idx })}
                        />
                    ))}
                </div>
            </div>

            {/* Tiny results panel */}
            {showIds && compare && (<CompareIds compare={compare} />)}

            {/* Payload changes */}
            <ComparePayloads showPayloads={showPayloads} payloadChanges={payloadChanges} />

            {/* Rate changes */}
            {showRates && rateChanges.length > 0 && (
                <div className="mb-2 text-md border p-2 event-success">
                    <div className="font-semibold mb-1">Rate changes (frames/sec)</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {rateChanges.map(({ id, rateA, rateB, delta }) => (
                            <div key={id} className="border p-2 rounded">
                                <div className="font-mono text-sm mb-1 event-info">{id}</div>
                                <div className="opacity-80 event-info">A: {rateA.toFixed(2)} · B: {rateB.toFixed(2)} · <span className='event-success'>Δ: {delta.toFixed(2)}</span></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {currentFrames.length > 0 && (
                <TableVirtuoso
                    data={currentFrames}
                    fixedHeaderContent={() => (
                        <tr className="grid grid-cols-[80px_80px_30px_200px_240px_600px] bg-green-950 text-white text-sm">
                            <th className="border px-1 py-1">Time(s)</th>
                            <th className="border px-1 py-1">HexID</th>
                            <th className="border px-1 py-1">Ln</th>
                            <th className="border px-1 py-1">Data</th>
                            <th className="border px-1 py-1">Label</th>
                            <th className="border px-1 py-1">Decoded</th>
                        </tr>
                    )}
                    itemContent={(index, frame) => (
                        <div
                            onMouseEnter={() => setHoveredRowIndex(index)}
                            onMouseLeave={() => setHoveredRowIndex(null)}
                            className={`event-info grid grid-cols-[80px_80px_30px_200px_240px_600px] transition-colors ${hoveredRowIndex === index ? 'bg-sky-200' : ''
                                }`}
                        >
                            <div className="border px-1 py-1">{frame[5].toFixed(3)}</div>
                            <div className="border px-1 py-1">{frame[0]}</div>
                            <div className="border px-1 py-1">{frame[7]}</div>
                            <div className="border px-1 py-1">
                                <HighlightedData hexId={frame[0]} data={frame[6]} />
                            </div>
                            <div className="border px-1 py-1">{frame[1] || 'No Label'}</div>
                            <div className="border px-1 py-1">{frame[3] || 'N/A'}</div>
                        </div>
                    )}
                    components={{
                        TableRow: undefined,
                        Table: (props) => (
                            <table {...props}
                                className="table-fixed border-collapse text-sm"
                                style={{ minWidth: '1212px' }}
                            />
                        ),
                    }}
                    style={{
                        height: '100vh',
                        overflowX: 'auto'
                    }}
                />
            )}
        </div>
    );
}
