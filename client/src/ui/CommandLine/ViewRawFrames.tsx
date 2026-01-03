// ViewRawFrames.tsx
import { useEffect, useMemo, useState } from 'react';
import { normalizeToCanFrames } from '../../utils/parseFrame';
import { useStore, type CanFrame } from '../../store';
import { HighlightedData } from './HighlightedData';
import { TableVirtuoso } from 'react-virtuoso';

type Props = {
    type: string;
};

export default function ViewRawFrames({ type }: Props) {
    const filtered: CanFrame[] = useMemo(() => {
        const store = useStore.getState();
        switch (type) {
            case "frames":
                return store.getFilteredFrames(store.frames);
            case "deltas":
                return store.getFilteredFrames(normalizeToCanFrames(store.databaseTables?.deltas || []));
            case "logs":
                return store.getFilteredFrames(normalizeToCanFrames(store.databaseTables?.logs || []));
            case "raw":
                return store.getFilteredFrames(normalizeToCanFrames(store.databaseTables?.raw || []));
            default:
                return [];
        }
    }, [type, useStore(state => state.filters)]);

    useEffect(() => {
        if (Array.isArray(filtered) && filtered.length > 0 && Array.isArray(filtered[0])) {
            useStore.getState().setByteVolatility(filtered);
        }
    }, [filtered]);

    const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);

    return (
        <div className="w-full h-full">
            <div className="mt-2 overflow-x-auto">
                <div className="min-w-[640px]">
                    <TableVirtuoso
                        data={filtered}
                        fixedHeaderContent={() => (
                            <tr className="grid grid-cols-[50px_300px_80px_60px_150px] bg-green-950 text-white text-sm">
                                <th className="border px-1 py-1">i++</th>
                                <th className="border px-1 py-1">Timestamp</th>
                                <th className="border px-1 py-1">HexID</th>
                                <th className="border px-1 py-1">Length</th>
                                <th className="border px-1 py-1">Data</th>
                            </tr>
                        )}
                        itemContent={(index, frame) => {
                            const timestamp = Number(frame[4]);
                            const date = new Date(timestamp);
                            const formattedTimestamp =
                                date.toLocaleString(undefined, {
                                    hour12: false,
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                }) +
                                '.' +
                                date.getMilliseconds().toString().padStart(3, '0');

                            return (
                                <div
                                    onMouseEnter={() => setHoveredRowIndex(index)}
                                    onMouseLeave={() => setHoveredRowIndex(null)}
                                    className={`event-info grid grid-cols-[50px_300px_80px_60px_150px] transition-colors ${hoveredRowIndex === index ? 'bg-sky-200' : ''
                                        }`}
                                >
                                    <div className="border px-1 py-1">{index + 1}</div>
                                    <div className="border px-1 py-1">{formattedTimestamp}</div>
                                    <div className="border px-1 py-1">{frame[0]}</div>
                                    <div className="border px-1 py-1">{frame[6].length}</div>
                                    <div className="border px-1 py-1 text-nowrap">
                                        <HighlightedData hexId={frame[0]} data={frame[6]} />
                                    </div>
                                </div>
                            );
                        }}
                        components={{
                            TableRow: undefined,
                            Table: (props) => (
                                <table {...props}
                                    className="table-fixed border-collapse text-sm"
                                    style={{ minWidth: '640px' }}
                                />
                            ),
                        }}
                        style={{ height: '100vh', overflowX: 'auto' }}
                    />
                </div>
            </div>
        </div>
    );
}
