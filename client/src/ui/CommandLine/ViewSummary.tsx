// src/ui/CommandLine/ViewSummary.tsx

import React, { useMemo } from 'react';
import { useStore } from '../../store';


export default function ViewSummary() {
    const frames = useStore(s => s.frames); // Live CAN frames (CanFrame[])

    const { duration, startTime } = useMemo(() => {
        const timestamps = frames
            .map(f => Number(f?.[4]))
            .filter(t => typeof t === 'number' && !isNaN(t) && t > 1000000000000); // sanity check for ms-based timestamps

        if (frames.length < 2) return { duration: '0.00', startTime: undefined };

        const first = Math.min(...timestamps);
        const last = Math.max(...timestamps);

        // console.log("First 3 frames", frames.slice(0, 3));
        // console.log("frame[4]", frames[0]?.[4]);
        return {
            duration: ((last - first) / 1000).toFixed(2),
            startTime: new Date(first).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
            }),
        };
    }, [frames]);

    const totalFrames = frames.length;
    const uniqueIds = useMemo(() => new Set(frames.map(f => f[1])).size, [frames]);

    const frequencyStats = useMemo(() => {
        const map = new Map<string, { count: number; signal: string; first: number; last: number }>();

        frames.forEach(frame => {
            const hexId = frame[0]; // hex_id
            const ts = Number(frame[5]); // timestamp

            if (!map.has(hexId)) {
                map.set(hexId, { count: 1, signal: frame[1], first: ts, last: ts });
            } else {
                const entry = map.get(hexId)!;
                entry.count += 1;
                entry.first = Math.min(entry.first, ts);
                entry.last = Math.max(entry.last, ts);
            }
        });

        return [...map.entries()]
            .map(([id, { count, signal, first, last }]) => {
                const duration = last - first;
                return {
                    id,
                    signal,
                    count,
                    hzRounded: isFinite(duration) && duration > 0 ? Math.round(count / duration) : 0,
                };
            })
            .sort((a, b) => b.hzRounded - a.hzRounded)
            .slice(0, 10); // Top 10
    }, [frames]);

    return (
        <div
            className="text-sm space-y-2 py-2 h-full"
            style={{ overflowX: 'auto' }}
        >
            <p className="font-semibold text-blue-600">🧾 Live Session Summary</p>
            <div className='flex justify-around'>
                <ul className="list-disc ml-5 text-gray-50">
                    <li>Total Frames: {totalFrames}</li>
                    <li>Unique CAN IDs: {uniqueIds}</li>
                </ul>
                <ul className="list-disc ml-5 text-gray-50">
                    <li>Duration: {`${duration ? duration + 's' : ''}`}</li>
                    <li>Session Start: {startTime}</li>
                </ul>
            </div>
            <div className="event-info">
                <p className="font-semibold text-blue-600">📡 Top 10 Highest Frequency Raw Signals</p>
                <table className="w-full text-left mt-2 text-sm table-auto border">
                    <thead className="event-success border-b">
                        <tr>
                            <th className="px-2 py-1 border">Hex ID</th>
                            <th className="px-2 py-1 border">Label</th>
                            <th className="px-2 py-1 border">Frames</th>
                            <th className="px-2 py-1 border">Frequency</th>
                        </tr>
                    </thead>
                    <tbody>
                        {frequencyStats.map(row => (
                            <tr key={row.id} className="border-b">
                                <td className="px-2 py-1 font-mono border">{row.id}</td>
                                <td className="px-2 py-1 border">{row.signal}</td>
                                <td className="px-2 py-1 border">{row.count}</td>
                                <td className="px-2 py-1 border">{row.hzRounded} Hz</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};