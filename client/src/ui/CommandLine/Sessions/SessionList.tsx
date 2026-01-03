// import React from 'react';
// import { useEffect } from 'react';
import { useStore } from '../../../store';

import axios from 'axios';

interface Props {
    setActiveTab: (tab: string) => void;
}

const SessionList = ({ setActiveTab }: Props) => {
    const getDuration = (start?: string, end?: string) => {
        const s = new Date(start ?? '').getTime();
        const e = new Date(end ?? '').getTime();
        return isNaN(s) || isNaN(e) ? 'N/A' : `${((e - s) / 1000).toFixed(1)}s`;
    };

    const {
        databaseSessions,
        // databaseTables,
        selectedSessionId,
        fetchSessions,
        // fetchSessionTables,
        setSelectedSessionId,
        clearSessionData,
        // loadSnapshotFromSession,
    } = useStore();


    return (
        <div>
            <h2 className="text-blue-600 text-xl font-bold mb-1">View Sessions</h2>
            <table className="w-full text-sm table-auto border">
                <thead className="event-success">
                    <tr>
                        <th className="p-2 border">Label</th>
                        <th className="p-2 border">Description</th>
                        {/* <th className="p-2 border">Start</th> */}
                        {/* <th className="p-2 border">End</th> */}
                        <th className="p-2 border">Time</th>
                        {/* <th className="p-2 border">Compare</th> */}
                        <th className="p-2 border">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {databaseSessions.map(s => (
                        <tr key={s.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 border">{s.label || `Session ${s.id}`}</td>
                            <td className="p-2 border">{s.description || '-'}</td>
                            {/* <td className="p-2 border">{s.start_time?.slice(0, 19).replace('T', ' ')}</td> */}
                            {/* <td className="p-2 border">{s.end_time?.slice(0, 19).replace('T', ' ')}</td> */}
                            <td className="p-2 border">{getDuration(s.start_time, s.end_time)}</td>
                            {/* <td className=''>
                                <button
                                    className="cmd-control small ml-2 hover:underline text-xs w-full"
                                    onClick={() => loadSnapshotFromSession('A', s.id, 'logs')}
                                >Load A</button>
                                <button
                                    className="cmd-control small ml-2 hover:underline text-xs w-full"
                                    onClick={() => loadSnapshotFromSession('B', s.id, 'logs')}
                                >Load B</button>
                            </td> */}

                            <td className="p-2 border space-x-1">
                                <button onClick={() => {
                                    setSelectedSessionId(s.id);
                                    setActiveTab('summary');
                                }} className="event-success text-blue-600 hover:underline text-xs px-1"
                                >View</button>

                                <button onClick={async () => {
                                    if (confirm('Are you sure?')) {
                                        await axios.delete(`/api/v1/sessions/${s.id}`);
                                        // setSessions(prev => prev.filter(sess => sess.id !== s.id));
                                        await fetchSessions(); // ✅ refresh the list
                                        if (selectedSessionId === s.id) { clearSessionData(); }
                                    }
                                }} className="event-error text-red-600 hover:underline text-xs px-1"
                                >Delete</button>

                                <button onClick={async () => {
                                    const res = await axios.get(`/api/v1/sessions/${s.id}/export`);
                                    const prefix = res.data.downloadPrefix;
                                    ['can_raw', 'can_logs', 'can_deltas'].forEach(table => {
                                        const link = document.createElement('a');
                                        link.href = `/exports/${prefix}-${table}.csv`;
                                        link.download = `${prefix}-${table}.csv`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    });
                                }} className="text-green-600 hover:underline text-xs px-1"
                                >Export</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>


        </div>
    );
}

export default SessionList;
