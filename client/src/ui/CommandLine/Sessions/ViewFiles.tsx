import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useStore } from '../../../store';
import { SessionTable } from './SessionTable'
import SessionList from './SessionList';
import { SessionSummary } from './SessionSummary';
// import SessionSnapshots from '../SessionSnapshots';


interface SignalPlaybackProps {
    isPlaying: boolean;
    onScrub: (time: number) => void;
}

const TABS = ['summary', 'candidates', 'logs', 'raw', 'playback', 'snapshots'] as const;
type TabType = typeof TABS[number];

const ViewDatabase: React.FC<SignalPlaybackProps> = ({ isPlaying, onScrub }) => {
    const [activeTab, setActiveTab] = useState<TabType>('summary');
    const isCollapsed = activeTab !== 'summary';

    const contentRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        requestAnimationFrame(() => {
            contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }, [activeTab]);


    // const setActiveView = useStore(s => s.setActiveView('playback'))
    const setActiveView = useStore(s => s.setActiveView);

    const {
        databaseSessions,
        databaseTables,
        selectedSessionId,
        // setSelectedSessionId,
        fetchSessions,
        // fetchSessionTables,
        clearSessionData,
    } = useStore();

    useEffect(() => {
        fetchSessions();
    }, []);

    useEffect(() => {
        if (selectedSessionId !== null) {
            useStore.getState().fetchSessionTables(selectedSessionId); // Load tables when session is selected
        }
    }, [selectedSessionId]);

    const getDuration = (start?: string, end?: string) => {
        const s = new Date(start ?? '').getTime();
        const e = new Date(end ?? '').getTime();
        return isNaN(s) || isNaN(e) ? 'N/A' : `${((e - s) / 1000).toFixed(1)}s`;
    };

    const sidebar = isCollapsed
        ? (<div className={`transition-all duration-300 w-5 overflow-hidden`}>
            <button
                onClick={() => {
                    clearSessionData();
                }}
                className="w-full flex justify-between"
            >
                <span className="text-xl font-bold"></span>
                <div className="event-success text-xl font-bold">⬅</div>
            </button>
            <div className="flex flex-col gap-2">
                <button
                    onClick={async () => {
                        if (confirm('Are you sure?')) {
                            await axios.delete(`/api/v1/sessions/${selectedSessionId}`);
                            // setSessions(prev => prev.filter(sess => sess.id !== selectedSessionId));
                            await fetchSessions();
                            clearSessionData();
                        }
                    }}
                    className="text-red-600 text-sm"
                >🗑</button>
                <button
                    onClick={async () => {
                        const res = await axios.get(`/api/v1/sessions/${selectedSessionId}/export`);
                        const prefix = res.data.downloadPrefix;
                        ['can_raw', 'can_logs'].forEach(table => {
                            const link = document.createElement('a');
                            link.href = `/exports/${prefix}-${table}.csv`;
                            link.download = `${prefix}-${table}.csv`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        });
                    }}
                    className="text-green-600 text-sm"
                >⬇️</button>
            </div>
        </div>)
        : (<div className={`w-1/4 transition-all duration-300`}>
            <button
                onClick={() => { clearSessionData(); }}
                className="w-full flex justify-between"
            >
                <span className="text-xl font-bold"></span>
                <div className="event-success text-xl font-bold">⬅</div>
            </button>

            <div className="text-gray-50 mb-4">
                <h3 className="capitalize text-lg font-semibold event-success mb-1">
                    {databaseSessions.find(s => s.id === selectedSessionId)?.label || `Session ${selectedSessionId}`}
                </h3>
                <p className="text-sm mb-1">
                    <span className='text-blue-600'>Description:</span> {databaseSessions.find(s => s.id === selectedSessionId)?.description || '—'}
                </p>
                <p className="text-sm mb-1">
                    <span className='text-blue-600'>Duration:</span> {getDuration(databaseSessions.find(s => s.id === selectedSessionId)?.start_time, databaseSessions.find(s => s.id === selectedSessionId)?.end_time)}
                </p>
            </div>

            <div className="flex  float-start gap-2">
                <button
                    onClick={async () => {
                        if (confirm('Are you sure?')) {
                            await axios.delete(`/api/v1/sessions/${selectedSessionId}`);
                            // setSessions(prev => prev.filter(sess => sess.id !== selectedSessionId));
                            await fetchSessions();
                            clearSessionData();
                        }
                    }}
                    className="text-red-600 text-sm"
                >
                    🗑 Delete Session
                </button>

                <button
                    onClick={async () => {
                        const res = await axios.get(`/api/v1/sessions/${selectedSessionId}/export`);
                        const prefix = res.data.downloadPrefix;
                        ['can_raw', 'can_logs'].forEach(table => {
                            const link = document.createElement('a');
                            link.href = `/exports/${prefix}-${table}.csv`;
                            link.download = `${prefix}-${table}.csv`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        });
                    }}
                    className="text-green-600 text-sm"
                >
                    ⬇️ Export Data
                </button>
            </div>
        </div>)

    return (
        <div className="">
            <div className="event-info">
                {!selectedSessionId && <SessionList
                    setActiveTab={() => setActiveTab}
                />}
            </div>
            {selectedSessionId && databaseTables && (
                <div className="w-full text-blue-600 flex gap-2 ">
                    {/* Sidebar */}
                    {sidebar}

                    {/* Main content area */}
                    <div
                        ref={contentRef}
                        className={`${isCollapsed ? "w-full" : "w-3/4"} overflow-hidden`}
                    >
                        <div className="event-success flex space-x-4 border-b mb-1">
                            {TABS.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        if (tab == "playback") {
                                            setActiveView('viewPlayback')
                                            setActiveTab(tab)
                                        }
                                        setActiveTab(tab)
                                    }}
                                    className={`px-1 text-xl font-semibold ${activeTab === tab ? 'border-b-2 border-blue-600 event-success' : 'text-gray-400'}`}
                                >
                                    {tab.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <div >
                            {activeTab === 'summary'
                                ? <SessionSummary
                                    setActiveTab={setActiveTab}

                                />
                                : <SessionTable
                                    sessionId={selectedSessionId}
                                    activeTab={activeTab}
                                    isPlaying={isPlaying}
                                    onScrub={onScrub}
                                />
                            }
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViewDatabase;
