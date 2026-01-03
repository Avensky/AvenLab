// import React from 'react';
import { useStore } from '../../store';

export default function CommandHistory() {
    const commandHistory = useStore((s) => s.commandHistory);

    return (
        <div className="cmd-history">
            {commandHistory.length === 0 ? (
                <div className="empty">No commands yet.</div>
            ) : (
                commandHistory.map((cmd: string, idx: number) => (
                    <div key={idx} className="cmd-item">
                        <span className="cmd-index">{idx + 1}.</span> {cmd}
                    </div>
                ))
            )}
        </div>
    );
}
