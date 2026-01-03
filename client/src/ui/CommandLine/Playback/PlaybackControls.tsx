import { useEffect } from "react";
import { useStore } from "../../../store";

// icons (reuse the same assets you already use)
import play from "/images/playback.svg";
import pause from "/images/pause3.svg";
import reload from "/images/loop.svg";
import rewind from "/images/backward.svg";
import back from "/images/back.svg";
import skip from "/images/skip.svg";
import forward from "/images/forward.svg";
import stop from "/images/stop4.svg";
import show from '/images/tv.svg'
import hide from '/images/hide.svg'

export default function PlaybackControls() {
    const isPlaying = useStore(s => s.isPlaying);
    const isLooping = useStore(s => s.isLooping ?? false);
    const menu = useStore(s => s.booleans.menu)
    // const cli = useStore(s => s.booleans.cli)

    // console.log('menu', menu);
    const playbackSpeed = useStore(s => s.playbackSpeed);
    const playbackTolerance = useStore(s => s.playbackTolerance);

    const selectedSnapshotA = useStore(state => state.selectedSnapshotA);
    const selectedSnapshotB = useStore(state => state.selectedSnapshotB);

    const activeView = useStore(s => s.activeView);
    const collapsed = useStore(s => s.playbackControlsCollapsed);
    const setCollapsed = (v: boolean) => useStore.getState().setPlaybackControlsCollapsed(v);


    const playbackIndex = useStore(s => s.playbackIndex);
    const groupedCount = useStore(s => s.groupedFramesCount || 0);
    // const firstTimestamps = useStore(s => s.groupedFirstTimestamps || []);
    // const atStart = playbackIndex <= 0;
    const atEnd = groupedCount === 0 || playbackIndex >= groupedCount - 1;
    // const ts = firstTimestamps[playbackIndex] ?? 0;

    const set = useStore.setState;


    // Auto-expand when playback view is selected, but never auto-collapse
    useEffect(() => {
        if (activeView === "viewPlayback" && collapsed) setCollapsed(false);
    }, [activeView, collapsed]);

    // Collapsed pill (minimal footprint, stays visible anywhere)
    if (collapsed) {
        return (
            <div className="w-full px-1 py-1">
                <div className="flex items-center text-sm overflow-visible relative z-50">

                    <button
                        style={{ background: 'transparent', fontSize: '2rem' }}
                        onClick={() => {
                            set((state) => ({
                                booleans: { ...state.booleans, menu: !menu, cli: menu },
                            }))
                        }}
                    >⚙️</button>
                    <div className="cmd-control-wrapper opacity-50">
                        <button
                            className="cmd-control"
                            style={{ backgroundImage: `url(${show})` }}
                            title="Show Playback Controls"
                            onClick={() => setCollapsed(false)}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Expanded full bar

    return (
        <div className="w-full px-1 py-1">
            <div className="flex items-center overflow-visible text-sm">
                <button
                    style={{ background: 'transparent', fontSize: '2rem' }}
                    onClick={() => {
                        set((state) => ({
                            booleans: { ...state.booleans, menu: !menu, cli: menu },
                        }))
                    }}
                >⚙️</button>

                <div className="cmd-control-wrapper">
                    <button
                        className="cmd-control"
                        style={{ backgroundImage: `url(${rewind})` }}
                        title="Rewind"
                        // disabled={groupedCount === 0 || atStart}
                        onClick={() => set({ playbackIndex: 0 })}
                    />
                </div>
                <div className="cmd-control-wrapper">
                    <button
                        className="cmd-control"
                        style={{ backgroundImage: `url(${back})` }}
                        // disabled={groupedCount === 0 || atStart}
                        title="Back"
                        onClick={() => set(s => ({ playbackIndex: Math.max(0, s.playbackIndex - 1) }))}
                    />
                </div>
                <div className="cmd-control-wrapper">
                    {isPlaying ? (
                        <button
                            className="cmd-control"
                            style={{ backgroundImage: `url(${pause})` }}
                            title="Pause"
                            onClick={() => set({ isPlaying: false })}
                        />
                    ) : (
                        <button
                            className="cmd-control"
                            style={{ backgroundImage: `url(${play})` }}
                            title="Play"
                            onClick={() => {
                                if (atEnd) {
                                    set({ playbackIndex: 0 })
                                }
                                set({ isPlaying: true })
                            }}
                        />
                    )}
                </div>

                <div className="cmd-control-wrapper">
                    <button
                        className="cmd-control"
                        style={{ backgroundImage: `url(${skip})` }}
                        title="Forward 1"
                        // disabled={groupedCount === 0 || atEnd}
                        // onClick={() => set(s => ({ playbackIndex: Math.min(groupedCount - 1, s.playbackIndex + 1) }))}
                        onClick={() => set(s => ({
                            playbackIndex: (s.playbackIndex + 1) % groupedCount
                        }))}

                    />
                </div>

                <div className="cmd-control-wrapper">
                    <button
                        className="cmd-control"
                        style={{ backgroundImage: `url(${forward})` }}
                        title="Forward"
                        // disabled={groupedCount === 0 || atEnd}
                        onClick={() => set({ playbackIndex: Math.max(0, groupedCount - 1) })}

                    />
                </div>

                <div className="cmd-control-wrapper">
                    <button
                        className="cmd-control stop"
                        style={{ backgroundImage: `url(${stop})` }}
                        title="Stop"
                        // disabled={groupedCount === 0 && !isPlaying}
                        onClick={() => set({ isPlaying: false, isLooping: false, playbackIndex: 0 })}
                    />
                </div>
                <div className="cmd-control-wrapper">
                    <button
                        className={`cmd-control reload ${isLooping ? "rotate" : ""}`}
                        style={{ backgroundImage: `url(${reload})` }}
                        title={isLooping ? "Disable Loop" : "Enable Loop"}
                        onClick={() => set(s => {
                            const nextLoop = !s.isLooping;
                            return { isLooping: nextLoop, isPlaying: nextLoop ? true : s.isPlaying };
                        })}
                    />
                </div>

                {/* Speed */}
                {/* <label className="ml-2 opacity-80">Speed</label> */}
                <div className="cmd-control-wrapper cmd-control-dropdown flex">
                    <select
                        name="playback-speed-dropdown"
                        className="cmd-control cmd-dropdown font-extrabold "
                        // value={playbackSpeed}
                        value={(playbackSpeed)}                 // ✅ stringify
                        onChange={(e) => set({ playbackSpeed: Number(e.target.value) })}
                    >
                        <option value={0.5}>0.5x</option>
                        <option value={1}>1.0x</option>
                        <option value={2}>2x</option>
                        <option value={5}>5x</option>
                        <option value={10}>10x</option>
                        <option value={20}>20x</option>
                        <option value={50}>50x</option>
                        <option value={100}>100x</option>
                    </select>
                </div>

                {/* Tolerance */}
                {/* <label className="ml-2 opacity-80">Tolerance</label> */}
                <div className="cmd-control-wrapper cmd-control-dropdown flex">
                    <select
                        name="playback-tolerance-dropdown"
                        className="cmd-control cmd-dropdown font-extrabold relative z-50"
                        value={playbackTolerance}
                        onChange={(e) => set({ playbackTolerance: Number(e.target.value) })}
                    >
                        <option value={0.001}>1 ms</option>
                        <option value={0.002}>2 ms</option>
                        <option value={0.005}>5 ms</option>
                        <option value={0.01}>10 ms</option>
                    </select>
                </div>


                <button className={`border-sky-100 border-solid border-2 px-1 py-0.5 flex justify-center font-extrabold text-nowrap cmd-control-wrapper rounded-none ${selectedSnapshotA ? 'active-snapshot' : ''}`}
                    onClick={() => {
                        const isActive = useStore.getState().selectedSnapshotA;
                        if (isActive) {
                            useStore.getState().clearSnapshot('A');
                            useStore.setState({ selectedSnapshotA: false });
                        }
                    }}
                >Clear A</button>



                <button className={`border-sky-100 border-solid border-2 px-1 py-0.5 flex justify-center font-extrabold text-nowrap cmd-control-wrapper rounded-none ${selectedSnapshotB ? 'active-snapshot' : ''}`}
                    onClick={() => {
                        const isActive = useStore.getState().selectedSnapshotB;
                        if (isActive) {
                            useStore.getState().clearSnapshot('B');
                            useStore.setState({ selectedSnapshotB: false });
                        }
                    }}>Clear B</button>


                {/* Collapse button (only user can hide) */}
                <div className="ml-auto cmd-control-wrapper">
                    <button
                        className="cmd-control"
                        title="Hide Playback Controls"
                        style={{ backgroundImage: `url(${hide})` }}
                        onClick={() => setCollapsed(true)}
                    >−</button>
                </div>


            </div>
        </div>
    );
}
