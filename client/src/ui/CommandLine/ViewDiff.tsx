import React from 'react';
import { useStore } from '../../store';
import { SnapshotDiff } from '../../utils/SnapshotDiff';

export default function ViewDiff() {
    const snapshots = useStore((s) => s.snapshots);

    if (!snapshots.A && !snapshots.B) {
        return (
            <div className="text-sm text-gray-400 p-4">
                ⚠️ Please select both Snapshot A and Snapshot B for comparison.
            </div>
        );
    }
    else if (snapshots.A && !snapshots.B) {
        return (
            <div className="text-sm text-gray-400 p-4">
                ⚠️ Please select a Snapshot B with a recorded action.
            </div>
        );
    }
    else if (!snapshots.A && snapshots.B) {
        return (
            <div className="text-sm text-gray-400 p-4">
                ⚠️ Please select a Snapshot A to use as a baseline.
            </div>
        );
    }

    // const diff = SnapshotDiff(snapshots.A, snapshots.B);
    const diff = SnapshotDiff(snapshots.A ?? [], snapshots.B ?? []);
    const ids = Object.keys(diff);

    // const [showOnlyChanged, setShowOnlyChanged] = useState(true);

    // const filteredIds = ids.filter(id => {
    //     return !showOnlyChanged || diff[id].byteDiffs.length > 0;
    // });


    return (
        <div className="p-4 text-sm">
            <h3 className="font-semibold mb-2 text-white">📊 Snapshot Comparison</h3>
            <table className="w-full text-left table-auto border border-gray-500 text-xs">
                <thead className="event-success">
                    <tr>
                        <th className="px-2 py-1 border">Hex ID</th>
                        <th className="px-2 py-1 border">Changes</th>
                    </tr>
                </thead>
                <tbody className="event-info">
                    {ids.map(id => {
                        const entry = diff[id];
                        return (
                            <tr key={id} className="border-b">
                                <td className="px-2 py-1 font-mono border">{id}</td>
                                <td className="px-2 py-1 border">
                                    {entry.byteDiffs.length > 0 ? (
                                        <span className="flex flex-wrap gap-2">
                                            {entry.byteDiffs.map(([oldVal, newVal], i) => (
                                                <span key={i} className="px-1 rounded bg-red-200 text-red-900">
                                                    {oldVal} → <span className="bg-green-200 text-green-900 px-1 rounded">{newVal}</span>
                                                </span>
                                            ))}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">unchanged</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};