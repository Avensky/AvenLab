import React from "react";
import { useInputStore } from "../store";
import { VehicleFlags, PlayerFlags, hasFlag } from "../store/tools/inputMasks";

const onOff = "/images/onOff.svg";
const headlights = "/images/headlights.svg";
const left = "/images/left.svg";
const right = "/images/right.svg";
const hazard = "/images/hazzard.svg";
const horn = "/images/hornCurve.svg";
const nos = "/images/nos.svg";
const soundOn = "/images/soundOn.svg";
const soundOff = "/images/soundOff.svg";
const reset = "/images/reset.svg";


function ControlsPanel(): React.JSX.Element {
    const vehicleMask = useInputStore((s) => s.input.vehicleMask);
    const playerMask = useInputStore((s) => s.input.playerMask);

    const toggleVehicleFlag = useInputStore((s) => s.toggleVehicleFlag);
    const setVehicleFlag = useInputStore((s) => s.setVehicleFlag);
    const togglePlayerFlag = useInputStore((s) => s.togglePlayerFlag);
    const setPlayerFlag = useInputStore((s) => s.setPlayerFlag);

    const engineOn = hasFlag(vehicleMask, VehicleFlags.ENGINE_ON);
    const headlightsOn = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
    const blinkerLeft = hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT);
    const blinkerRight = hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT);
    const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
    const boost = hasFlag(vehicleMask, VehicleFlags.BOOST);

    const radio = hasFlag(playerMask, PlayerFlags.RADIO);
    const honk = hasFlag(playerMask, PlayerFlags.HONK);
    const resetActive = hasFlag(playerMask, PlayerFlags.RESET);

    const holdPlayerFlag = (flag: number, enabled: boolean) => {
        setPlayerFlag(flag, enabled);
    };

    return (
        <div className="ControlsPanel">
            <div className="row">
                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${resetActive ? "pulse" : ""}`}
                    style={{ backgroundImage: `url(${reset})` }}
                    onPointerDown={() => holdPlayerFlag(PlayerFlags.RESET, true)}
                    onPointerUp={() => holdPlayerFlag(PlayerFlags.RESET, false)}
                    onPointerLeave={() => holdPlayerFlag(PlayerFlags.RESET, false)}
                    onPointerCancel={() => holdPlayerFlag(PlayerFlags.RESET, false)}
                />

                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${radio ? "headlight" : ""}`}
                    style={{ backgroundImage: `url(${radio ? soundOn : soundOff})` }}
                    onClick={() => togglePlayerFlag(PlayerFlags.RADIO)}
                />

                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${headlightsOn ? "headlight" : ""}`}
                    style={{ backgroundImage: `url(${headlights})` }}
                    onClick={() => toggleVehicleFlag(VehicleFlags.HEADLIGHTS)}
                />
            </div>

            <div className="row">
                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${blinkerLeft ? "flash" : ""}`}
                    style={{ backgroundImage: `url(${left})` }}
                    onClick={() => toggleVehicleFlag(VehicleFlags.BLINKER_LEFT)}
                />

                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${hazards ? "flash" : ""}`}
                    style={{ backgroundImage: `url(${hazard})` }}
                    onClick={() => toggleVehicleFlag(VehicleFlags.HAZARDS)}
                />

                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${blinkerRight ? "flash" : ""}`}
                    style={{ backgroundImage: `url(${right})` }}
                    onClick={() => toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT)}
                />
            </div>

            <div className="row">
                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${honk ? "pulse" : ""}`}
                    style={{ backgroundImage: `url(${horn})` }}
                    onPointerDown={() => holdPlayerFlag(PlayerFlags.HONK, true)}
                    onPointerUp={() => holdPlayerFlag(PlayerFlags.HONK, false)}
                    onPointerLeave={() => holdPlayerFlag(PlayerFlags.HONK, false)}
                    onPointerCancel={() => holdPlayerFlag(PlayerFlags.HONK, false)}
                />

                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${boost ? "boost" : ""}`}
                    style={{ backgroundImage: `url(${nos})` }}
                    onPointerDown={() => setVehicleFlag(VehicleFlags.BOOST, true)}
                    onPointerUp={() => setVehicleFlag(VehicleFlags.BOOST, false)}
                    onPointerLeave={() => setVehicleFlag(VehicleFlags.BOOST, false)}
                    onPointerCancel={() => setVehicleFlag(VehicleFlags.BOOST, false)}
                />

                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`control ${engineOn ? "active" : ""}`}
                    style={{ backgroundImage: `url(${onOff})` }}
                    onClick={() => toggleVehicleFlag(VehicleFlags.ENGINE_ON)}
                />
            </div>
        </div>
    );
}

export default ControlsPanel;