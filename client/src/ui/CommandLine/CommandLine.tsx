import { useEffect, useState } from "react";
import { Output, Input } from ".";
// import { Output, Input, CommandHistory } from "./";
import clear from "/images/clear2.svg";
import log from '/images/logs.svg'
import stop from '/images/stop3.svg'
import raw from '/images/analytics7.svg'
import files from '/images/analytics4.svg'
import shell from '/images/cli4.svg'
import tv from '/images/tv.svg'
// import deltas from '/images/analytics6.svg'
import diff from '/images/analytics6.svg'
import summary from '/images/analytics2.svg'
import database from '/images/books2.svg'
// import markAdd from '/images/mark.svg'
import markSub from '/images/mark3.svg'
import mark from '/images/mark.svg'
// import save from '/images/save.svg'
import { useStore } from "../../store";
import socket from "../../socket";
import { useThrottledEmitControls } from "../../hooks/useThrottleEmitControls";
// import DynoGraph from "./DynoGraph";
import Filter from './Filter';
import ViewFrames from './ViewFrames'
import ViewFiles from './Sessions/ViewFiles'
import ViewRawFrames from './ViewRawFrames'
import ViewSummary from "./ViewSummary";
import SignalPlayback from "./Playback/ViewPlayback";
import ViewDiff from "./ViewDiff";
import VehicleManager from './Vehicles/VehicleManager';
import carIcon from '/images/car.svg';
// import SessionSnapshots from './SessionSnapshots';

interface Props { cmdEvents: string[]; }

export default function CommandLine({ cmdEvents }: Props) {
    const [logs, setLogs] = useState<string[]>([]);
    const [clearInputFlag, setClearInputFlag] = useState(false);
    const setActiveView = useStore(s => s.setActiveView);
    const [viewFiles, _setViewFiles] = useState("cli");
    const setViewFiles = (v: string) => {
        _setViewFiles(v);
        setActiveView(v);
    };
    // inside ViewDatabase component, after the useState for activeTab:
    // useEffect(() => {
    //     // wait for the new tab to render, then scroll
    //     requestAnimationFrame(() => {
    //         window.scrollTo({ top: 0, behavior: 'smooth' });
    //     });
    // }, [viewFiles]);

    const isPlaying = useStore(state => state.isPlaying);

    // update controls
    const setControls = useStore((s) => s.setControls);
    const controls = useStore((s) => s.controls);
    useThrottledEmitControls(socket, 60)

    //
    const cli = useStore(state => state.booleans.cli)

    // const dyno = useStore(state => state.controls.dyno)
    const candump = useStore(state => state.controls.candump)

    const toggleControl = (key: keyof typeof controls) => {
        const nextControls = { ...controls, [key]: !controls[key] };
        setControls(nextControls);
        // socket.emit('controls', { ...nextControls });
    };


    const currentSessionId = useStore(state => state.currentSessionId);

    // Keep logs updated only when not paused
    // useEffect(() => { if (!paused) setLogs(cmdEvents) }, [cmdEvents, paused, candump]);
    useEffect(() => { setLogs(cmdEvents) }, [cmdEvents]);

    let body;
    if (viewFiles === "viewSummary") { body = <ViewSummary /> }
    else if (viewFiles === "viewSession") {
        body = <>
            <Filter />
            <ViewFrames type="frames" />
        </>
    }
    else if (viewFiles === "viewRaw") {
        body = <>
            <Filter />
            <ViewRawFrames type="frames" />
        </>
    }
    else if (viewFiles === "cli") { body = <Output paused={false} logs={logs} events={cmdEvents} cli={cli} /> }
    else if (viewFiles === 'vehicles') { body = <VehicleManager /> }
    else if (viewFiles === "viewDiff") { body = <ViewDiff /> }
    else if (viewFiles === "viewFiles") { body = <ViewFiles isPlaying={isPlaying} onScrub={() => { }} /> }
    else if (viewFiles === "viewPlayback") {
        body = <>
            <Filter />
            <SignalPlayback
                type="frames"
                isPlaying={isPlaying}
                onScrub={() => { }}
            />
        </>
    }

    return (
        <div
            style={{ pointerEvents: cli ? 'auto' : 'none', }}
            className={`command-line popup-left ${cli ? 'open' : ''}`}
        >
            <div className="command">
                <div className="cmd-controls">
                    <div className="cmd-controls-left py-0.5">
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control ${candump ? 'stop' : 'log'}`}
                                onClick={() => {
                                    // useStore.getState().setFramesToSave([])
                                    if (!candump) {
                                        useStore.getState().setFrames([])
                                        setViewFiles("cli")
                                    }
                                    toggleControl('candump')
                                }}
                                style={{ backgroundImage: `url(${candump ? stop : log})` }}
                            />
                        </div>

                        <div className="cmd-control-wrapper">
                            <button className="cmd-control"

                                disabled={!candump || !currentSessionId}
                                title={
                                    !candump ? 'Start candump to add marks'
                                        : !currentSessionId ? 'No active session'
                                            : 'Add mark'
                                }
                                onClick={() => {
                                    const sid = useStore.getState().currentSessionId;
                                    if (sid) {
                                        fetch(`/api/v1/sessions/${sid}/marks`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            // No t_ms here — let the server compute it
                                            body: JSON.stringify({ type: 'action' })
                                        });
                                    } else {
                                        // fallback to local marker if no session yet
                                        useStore.getState().addActionMark(0);
                                    }
                                    // if (!candump || !currentSessionId) return;
                                    // fetch(`/api/v1/sessions/${currentSessionId}/marks`, {
                                    //     method: 'POST',
                                    //     headers: { 'Content-Type': 'application/json' },
                                    //     body: JSON.stringify({ t_ms, type: 'action' })
                                    // });
                                }}
                                style={{ backgroundImage: `url(${mark})` }}
                            />
                        </div>

                        <div className="cmd-control-wrapper">
                            <button
                                className="cmd-control"
                                onClick={() => useStore.getState().clearActionMarks()}
                                style={{ backgroundImage: `url(${markSub})` }}
                            />
                        </div>

                        {/* <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control ${dyno ? 'stop' : 'graph'}`}
                                onClick={() => {
                                    // setViewFiles(false)
                                    if (!candump) {
                                        useStore.getState().setFrames([])
                                        setViewFiles(false)
                                    }
                                    toggleControl('dyno')
                                }}
                                style={{ backgroundImage: `url(${dyno ? stop : graphIcon})` }}
                            />
                        </div> */}

                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("viewSummary")}
                                style={{ backgroundImage: `url(${summary})` }}
                            />
                        </div>

                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("viewSession")}
                                style={{ backgroundImage: `url(${files})` }}
                            />
                        </div>
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("viewRaw")}
                                style={{ backgroundImage: `url(${raw})` }}
                            />
                        </div>
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("viewPlayback")}
                                style={{ backgroundImage: `url(${tv})` }}
                            />
                        </div>
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("viewFiles")}
                                style={{ backgroundImage: `url(${database})` }}
                            />
                        </div>
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("viewDiff")}
                                style={{ backgroundImage: `url(${diff})` }}
                            />
                        </div>
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles("cli")}
                                style={{ backgroundImage: `url(${shell})` }}
                            />
                        </div>
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control log`}
                                onClick={() => setViewFiles('vehicles')}
                                title="Vehicles"
                                // Optional: set an icon background if you have one
                                style={{ backgroundImage: `url(${carIcon})` }}
                            />
                        </div>
                        {/******************** END lEFT ***********************/}
                    </div>

                    <div className="cmd-controls-right">
                        <div className="cmd-control-wrapper">
                            <button
                                className={`cmd-control clear`}
                                style={{ backgroundImage: `url(${clear})` }}
                                onClick={() => useStore.getState().set((state) => ({
                                    booleans: {
                                        ...state.booleans,
                                        cli: false,
                                    },
                                }))}
                            />
                        </div>
                    </div>

                    {/* END OF NAVBAR */}
                </div>
            </div>
            <div className="Log">{body}</div>
            {/* {dyno
                ? <DynoGraph paused={paused} />
                : <Output paused={paused} logs={logs} events={cmdEvents} cli={cli} />
            } */}
            {/* <CommandHistory /> */}
            <Input
                viewFiles={viewFiles}
                clearInputFlag={clearInputFlag}
                setClearInputFlag={setClearInputFlag} />
        </div >
    )
}
