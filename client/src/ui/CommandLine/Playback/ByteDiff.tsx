import React from "react";

type Props = {
    a: string;
    b: string;
}

const ByteDiff = ({ a, b }: Props) => {
    const A = a.trim().split(/\s+/);
    const B = b.trim().split(/\s+/);
    const len = Math.max(A.length, B.length);
    return (
        <div className="font-mono event-info">
            <div>
                A:{' '}
                {Array.from({ length: len }, (_, i) => (
                    <React.Fragment key={'a' + i}>
                        <span className={A[i] !== B[i] ? 'bg-white rounded px-1' : ''}>
                            {A[i] || '--'}
                        </span>
                        {' '}
                    </React.Fragment>
                ))}
            </div>
            <div>
                B:{' '}
                {Array.from({ length: len }, (_, i) => (
                    <React.Fragment key={'b' + i}>
                        <span className={A[i] !== B[i] ? 'bg-white rounded px-1' : ''}>
                            {B[i] || '--'}
                        </span>
                        {' '}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default ByteDiff