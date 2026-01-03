import { useEffect, useRef } from 'react';
import type { Key } from 'react';
import React from 'react';
interface OutputProps {
    events: string[];
    paused: boolean;
    logs: string[];
    cli: boolean;
}

export default function Output({ logs }: OutputProps): React.JSX.Element {
    const logEndRef = useRef<HTMLDivElement | null>(null);

    // console.log('output logs', logs);
    // Auto Scroll
    const scrollToBottom = () => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'instant' });
        }
    };

    useEffect(scrollToBottom, [logs]);

    return (
        <div style={{
            // pointerEvents: cli ? 'auto' : 'none',
        }}
            className=''>
            <div className='Messages'>
                {logs.map((e: string, i: Key) => {
                    let className = 'Event';

                    if (typeof e === 'string') {
                        if (e.toLowerCase().includes('error')) className += ` ${'event-error'}`;
                        else if (e.toLowerCase().includes('success')) className += ` ${'event-success'}`;
                        else if (e.toLowerCase().includes('debug')) className += ` ${'event-debug'}`;
                        else className += ` ${'event-info'}`;
                    }

                    return (
                        <div key={i} className={className}>
                            {typeof e === 'string' ? e : JSON.stringify(e, null, 2)}
                        </div>
                    );
                })}
                <div ref={logEndRef} />
            </div>
        </div>
    );
}
