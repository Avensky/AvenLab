// ViewDatabase.tsx
import { useEffect, useMemo, useState } from 'react';
import { normalizeToCanFrames } from '../../utils/parseFrame'
import { useStore, type CanFrame } from '../../store';
import { HighlightedData } from './HighlightedData';
import { TableVirtuoso } from 'react-virtuoso';

type Props = { type: string; };

export default function ViewFrames({ type }: Props) {
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
            {/* <div className="event-info text-lg font-bold">Enriched CAN Frames</div> */}
            <TableVirtuoso
                data={filtered}
                fixedHeaderContent={() => (
                    <tr className="grid grid-cols-[50px_80px_60px_30px_200px_240px_600px] bg-green-950 text-white text-sm">
                        <th className="border px-1 py-1">i++</th>
                        <th className="border px-1 py-1">Time</th>
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
                        className={`event-info grid grid-cols-[50px_80px_60px_30px_200px_240px_600px] transition-colors ${hoveredRowIndex === index ? 'bg-sky-200' : ''
                            }`}
                    >
                        <div className="border px-1 py-1">{index + 1}</div>
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
                    overflowX: 'auto',
                }}
            />
        </div>
    );

};
