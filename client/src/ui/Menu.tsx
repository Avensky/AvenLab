import { useStore } from '../store'

export default function Menu({ onLeaveGame }: { onLeaveGame: () => void }) {
    const menu = useStore((s) => s.booleans.menu)
    const set = useStore.getState().set
    // console.log('menu', menu);

    const screen = useStore.getState().screen

    const closeMenu = () => {
        set((state) => ({
            booleans: { ...state.booleans, menu: false },
        }))
    }

    return (
        <div className="help ">
            <div
                className={`popup ${menu ? 'open' : ''}`}
                onClick={closeMenu}
            >
                <div
                    className="menu-popup-content"
                    onClick={(e) => e.stopPropagation()} // 👈 prevent closing when clicking inside
                >
                    <h2>Game Settings</h2>
                    <button className='settings-button' onClick={() => set((state) => ({
                        booleans: { ...state.booleans, menu: false },
                    }))
                    }>Resume Game</button>
                    <button className='settings-button' onClick={() => set((state) => ({
                        booleans: { ...state.booleans, cli: true, menu: false },
                    }))}>Command Line Logs</button>
                    <button className='settings-button' onClick={() => set((state) => ({
                        booleans: { ...state.booleans, help: true, menu: false },
                    }))}>Keybindings</button>
                    {screen === 'game-screen' ? <button className='settings-button' onClick={onLeaveGame}>Leave Game</button> : null}
                </div>
            </div>
        </div>

    )
}
