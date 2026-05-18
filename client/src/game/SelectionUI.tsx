import { useState } from 'react';
import left from '/images/left-arrow.svg'
import right from '/images/right-arrow.svg'

interface SelectionUIProps {
    handleVehiclePrev: () => void
    handleVehicleNext: () => void
    handleMapPrev: () => void
    handleMapNext: () => void
    handleSpawn: () => void
    vehicleName: string
    mapName: string
}
export default function SelectionUI(
    {
        handleVehiclePrev,
        handleVehicleNext,
        handleMapPrev,
        handleMapNext,
        vehicleName,
        mapName,
        handleSpawn
    }: SelectionUIProps) {
    const [clickedBtn, setClickedBtn] = useState<string | null>(null);

    function animateButton(id: string, callback: () => void) {
        setClickedBtn(id);
        callback();
        setTimeout(() => setClickedBtn(null), 300);
    }
    return (
        <div className='selection-wrapper'>
            {/* UI controls fixed on screen */}
            {/* <h2>{selectedVehicle.name}</h2> */}
            <div className='selection-bar'>
                <button

                    onContextMenu={(e) => e.preventDefault()}
                    className={`selection ${clickedBtn === 'vehiclePrev' ? 'clicked' : ''}`}
                    style={{ backgroundImage: `url(${left})` }}
                    onClick={() => animateButton('vehiclePrev', handleVehiclePrev)}

                />
                <span className='selection-name'>{vehicleName}</span>
                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`selection ${clickedBtn === 'vehicleNext' ? 'clicked' : ''}`}
                    style={{ backgroundImage: `url(${right})` }}
                    onClick={() => animateButton('vehicleNext', handleVehicleNext)}

                />
            </div>

            {/* <h3 style={{ marginTop: '2rem' }}>{selectedMap.name}</h3> */}
            <div className='selection-bar'>
                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`selection ${clickedBtn === 'mapPrev' ? 'clicked' : ''}`}
                    style={{ backgroundImage: `url(${left})` }}
                    onClick={() => animateButton('mapPrev', handleMapPrev)}

                />
                <span className='selection-name'>{mapName}</span>
                <button
                    onContextMenu={(e) => e.preventDefault()}
                    className={`selection ${clickedBtn === 'mapNext' ? 'clicked' : ''}`}
                    style={{ backgroundImage: `url(${right})` }}
                    onClick={() => animateButton('mapNext', handleMapNext)}
                />
            </div>
            <button
                className={`selection selection-select ${clickedBtn === 'spawn' ? 'clicked' : ''}`}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => animateButton('spawn', handleSpawn)}
            >
                Start Game
            </button>
        </div>
    );
}
