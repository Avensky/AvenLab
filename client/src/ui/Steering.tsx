import React, { useState } from 'react';
import { useStore } from '../store';
import socket from '../socket';
import left from '/images/arrowleft.svg';
import right from '/images/arrowright.svg';
import { useThrottledEmitControls } from '../hooks/useThrottleEmitControls';

function Steering(): React.JSX.Element {
    const setControls = useStore((s) => s.setControls);
    const controls = useStore((s) => s.controls);
    useThrottledEmitControls(socket, 60)

    const [clickedBtn, setClickedBtn] = useState<string | null>(null);

    function animateButton(id: string) {
        setClickedBtn(id);
        setTimeout(() => setClickedBtn(null), 300);
    }

    return (
        <div className="Steering">
            <div className='split'>
                <button
                    style={{ backgroundImage: `url(${left})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`left arrow ${controls.left ? 'hold' : ''} ${clickedBtn === 'leftArrow' ? 'clicked' : ''}`}
                    onClick={() => animateButton('leftArrow')}
                    onPointerDown={() => {
                        const nextControls = { ...controls, left: true };
                        setControls(nextControls);
                        // socket.emit('controls', { ...nextControls });

                    }}
                    onPointerUp={() => {
                        const nextControls = { ...controls, left: false };
                        setControls(nextControls);
                        // socket.emit('controls', { ...nextControls });

                    }}
                    onPointerLeave={() => {
                        const nextControls = { ...controls, left: false };
                        setControls(nextControls);
                        // socket.emit('controls', { ...nextControls });

                    }}
                />



                <button
                    style={{ backgroundImage: `url(${right})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`right arrow ${controls.right ? 'hold' : ''} ${clickedBtn === 'rightArrow' ? 'clicked' : ''}`}
                    onClick={() => animateButton('rightArrow')}
                    onPointerDown={() => {
                        const nextControls = { ...controls, right: true };
                        setControls(nextControls);
                        // socket.emit('controls', { ...nextControls });

                    }}
                    onPointerUp={() => {
                        const nextControls = { ...controls, right: false };
                        setControls(nextControls);
                        // socket.emit('controls', { ...nextControls });

                    }}
                    onPointerLeave={() => {
                        const nextControls = { ...controls, right: false };
                        setControls(nextControls);
                        // socket.emit('controls', { ...nextControls });

                    }}
                />
            </div>
        </div>
    );
}

export default Steering;