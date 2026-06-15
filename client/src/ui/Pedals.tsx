import React from "react";
import { useInputStore } from "../store";

const gear = "/images/gear-stick.svg";
const brakes = "/images/brakePedal.png";
const accelerator = "/images/gasPedal.png";

function Pedals(): React.JSX.Element {
    const throttle = useInputStore((s) => s.input.throttle);
    const brake = useInputStore((s) => s.input.brake);
    const setAnalog = useInputStore((s) => s.setAnalog);

    return (
        <div className="Pedals">
            <div className="split">
                {/* Reverse */}
                <button
                    style={{ backgroundImage: `url(${gear})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`backward pedal ${throttle < 0 ? "pressed" : ""}`}
                    onPointerDown={() => setAnalog({ throttle: -1 })}
                    onPointerUp={() => setAnalog({ throttle: 0 })}
                    onPointerLeave={() => setAnalog({ throttle: 0 })}
                    onPointerCancel={() => setAnalog({ throttle: 0 })}
                />

                {/* Brake */}
                <button
                    style={{ backgroundImage: `url(${brakes})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`pedal ${brake > 0 ? "pressed" : ""}`}
                    onPointerDown={() => setAnalog({ brake: 1 })}
                    onPointerUp={() => setAnalog({ brake: 0 })}
                    onPointerLeave={() => setAnalog({ brake: 0 })}
                    onPointerCancel={() => setAnalog({ brake: 0 })}
                >
                    <div className="footBrake" />
                </button>

                {/* Accelerator */}
                <button
                    style={{ backgroundImage: `url(${accelerator})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`pedal ${throttle > 0 ? "pressed" : ""}`}
                    onPointerDown={() => setAnalog({ throttle: 1 })}
                    onPointerUp={() => setAnalog({ throttle: 0 })}
                    onPointerLeave={() => setAnalog({ throttle: 0 })}
                    onPointerCancel={() => setAnalog({ throttle: 0 })}
                />
            </div>
        </div>
    );
}

export default Pedals;