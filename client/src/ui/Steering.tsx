import React, { useState } from "react";
import { useInputStore } from "../store";

const left = "/images/arrowleft.svg";
const right = "/images/arrowright.svg";

function Steering(): React.JSX.Element {
    const steer = useInputStore((s) => s.input.steer);
    const setAnalog = useInputStore((s) => s.setAnalog);

    const [clickedBtn, setClickedBtn] = useState<string | null>(null);

    function animateButton(id: string) {
        setClickedBtn(id);
        window.setTimeout(() => setClickedBtn(null), 300);
    }

    const setSteerLeft = (enabled: boolean) => {
        setAnalog({ steer: enabled ? -1 : 0 });
    };

    const setSteerRight = (enabled: boolean) => {
        setAnalog({ steer: enabled ? 1 : 0 });
    };

    return (
        <div className="Steering">
            <div className="split">
                <button
                    style={{ backgroundImage: `url(${left})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`left arrow ${steer < 0 ? "hold" : ""} ${clickedBtn === "leftArrow" ? "clicked" : ""
                        }`}
                    onClick={() => animateButton("leftArrow")}
                    onPointerDown={() => setSteerLeft(true)}
                    onPointerUp={() => setSteerLeft(false)}
                    onPointerLeave={() => setSteerLeft(false)}
                    onPointerCancel={() => setSteerLeft(false)}
                />

                <button
                    style={{ backgroundImage: `url(${right})` }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`right arrow ${steer > 0 ? "hold" : ""} ${clickedBtn === "rightArrow" ? "clicked" : ""
                        }`}
                    onClick={() => animateButton("rightArrow")}
                    onPointerDown={() => setSteerRight(true)}
                    onPointerUp={() => setSteerRight(false)}
                    onPointerLeave={() => setSteerRight(false)}
                    onPointerCancel={() => setSteerRight(false)}
                />
            </div>
        </div>
    );
}

export default Steering;