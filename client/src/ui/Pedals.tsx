import React from 'react';
import { useStore } from '../store';
import socket from '../socket';
import gear from '/images/gear-stick.svg';
import { useThrottledEmitControls } from '../hooks/useThrottleEmitControls';
function Pedals(): React.JSX.Element {
  // const [gasPedal, setGasPedal] = useState(0);
  // const [brakePedal, setBrakePedal] = useState(0);

  const setControls = useStore((s) => s.setControls);
  const controls = useStore((s) => s.controls);
  useThrottledEmitControls(socket, 60)
  // const handleGasPedalChange = (value: number) => {
  //   // setGasPedal(value);
  //   setControls({ forward: true });
  //   socket.emit('controls', { forward: true });
  //   console.log('accelerator clicked');
  // };

  // const handleBrakePedalChange = (value: number) => {
  //   // setBrakePedal(value);
  //   setControls({ brake: true });
  //   // socket.emit('controls', { brake: value });
  //   console.log('brake clicked');
  // };

  return (
    <div className="Pedals">
      <div className='split'>
        <button
          style={{ backgroundImage: `url(${gear})` }}
          onContextMenu={(e) => e.preventDefault()}
          className={`backward pedal ${controls.backward ? 'pressed' : ''}`}
          onPointerDown={() => {
            const nextControls = { ...controls, backward: true };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
          onPointerUp={() => {
            const nextControls = { ...controls, backward: false };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
          onPointerLeave={() => {
            const nextControls = { ...controls, backward: false };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
        />
        <button
          onContextMenu={(e) => e.preventDefault()}
          className={`pedal ${controls.brake ? 'pressed' : ''}`}
          onPointerDown={() => {
            const nextControls = { ...controls, brake: true };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
          onPointerUp={() => {
            const nextControls = { ...controls, brake: false };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
          onPointerLeave={() => {
            const nextControls = { ...controls, brake: false };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
        >
          <div className='footBrake' />
        </button>
        <button
          onContextMenu={(e) => e.preventDefault()}
          className={`accelerator pedal ${controls.forward ? 'pressed' : ''}`}
          onPointerDown={() => {
            const nextControls = { ...controls, forward: true };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
          onPointerUp={() => {
            const nextControls = { ...controls, forward: false };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
          onPointerLeave={() => {
            const nextControls = { ...controls, forward: false };
            setControls(nextControls);
            // socket.emit('controls', { ...nextControls });

          }}
        />
      </div>
    </div >
  );
}

export default Pedals;