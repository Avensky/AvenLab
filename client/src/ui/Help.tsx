import { useStore } from '../store'
import clear from "/images/clear2.svg";
import { Keys } from './Keys'

export default function Help(): React.JSX.Element {
    const help = useStore((state) => state.booleans.help)
    const sound = useStore((state) => state.booleans.sound)

    return (
        <>
            <div className={`${sound ? 'sound' : 'nosound'}`}></div>
            <div className="help">
                <div className={`popup ${help ? 'open' : ''}`}>
                    <button
                        style={{ backgroundImage: `url(${clear})` }}
                        className="popup-close"
                        onClick={() => useStore.getState().set((state) => ({
                            booleans: { ...state.booleans, help: false }
                        }))} />
                    <div className="popup-content">
                        <Keys />
                    </div>
                </div>
            </div>
        </>
    )
}
