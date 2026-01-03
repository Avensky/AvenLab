// Input Line
import React, { useEffect, useState, useRef } from 'react'
import { useStore } from '../../store';
import stop from '/images/stop.svg'
import voice from '/images/voice.svg'
import upload from '/images/addfile.svg'
import uploadFolder from '/images/addfolder.svg'
import axios from 'axios'

export default function Input({
    clearInputFlag,
    setClearInputFlag,
    viewFiles
}: {
    clearInputFlag: boolean;
    setClearInputFlag: React.Dispatch<React.SetStateAction<boolean>>;
    viewFiles: string;
}) {
    const [value, setValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null); // ✅Reselect input after submit
    const [shouldFocus, setShouldFocus] = useState(false);
    const message = useStore((s) => s.message)
    const setMessage = useStore((s) => s.setMessage)



    let placeholder = "Select Here, Give Me a Command"
    if (viewFiles === "viewSession" || viewFiles === "viewDeltas") {
        placeholder = "save <filename> // replace <filename> with action taken"
    }
    const commandHistory = useStore((s) => s.commandHistory);
    // const historyIndex = useStore((s) => s.historyIndex);
    const addCommand = useStore((s) => s.addCommand);
    const setHistoryIndex = useStore((s) => s.setHistoryIndex);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = useStore.getState().historyIndex;
            const newIndex =
                prev === null ? commandHistory.length - 1 : Math.max(prev - 1, 0);
            setValue(commandHistory[newIndex] ?? '');
            setHistoryIndex(newIndex);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const prev = useStore.getState().historyIndex;
            if (prev === null) return;
            const newIndex = Math.min(prev + 1, commandHistory.length - 1);
            setValue(commandHistory[newIndex] ?? '');
            setHistoryIndex(newIndex);
        }
    };
    function onSubmit(event: React.FormEvent) {
        const val = value.trim();
        let data = {}, url = '/api/v1/cmd/';
        event.preventDefault()
        setIsLoading(true)
        if (val.startsWith('save')) {
            url = '/api/v1/saveSession';
            const label = val.split(' ')[1] || 'Unnamed_Session';
            const deltas = useStore.getState().framesToSave;
            const frames = useStore.getState().frames;
            data = {
                userLabel: label,
                enrichedDeltas: deltas,
                enrichedFrames: frames,
                socketId: useStore.getState().player?.id,
            }
            if (frames.length === 0) {
                console.warn("❌ No frames to save.");
                return;
            }
        } else {
            data = {
                command: value
            }
        }
        axios
            .post(url, { data })
            .then(() => {
                addCommand(value)
                setIsLoading(false)
                setHistoryIndex(null);                    // ✅ Reset index
                setValue('');                             // ✅ Clear input
                setShouldFocus(true);         // ✅ next render will re-focus!
                // console.log(response.data);
            }).catch((err) => {
                addCommand(value);
                const msg = err?.response?.data?.error || '❌ Unknown Error';
                setMessage(msg);
            }).finally(() => {
                setIsLoading(false)
                setValue('');
                setShouldFocus(true);// ✅ next render will re-focus!
                setTimeout(() => setMessage(null), 3000);// Auto-clear message after 4 seconds
            })
    }

    useEffect(() => {
        if (shouldFocus && inputRef.current) {
            inputRef.current.focus();
            setShouldFocus(false);  // ✅ don’t run again until next submit
        }
    }, [shouldFocus]);

    useEffect(() => {
        if (clearInputFlag) {
            setValue('');
            setShouldFocus(true);
            setClearInputFlag(false);
        }
    }, [clearInputFlag]);


    return (
        <form onSubmit={onSubmit} className='command-line-wrapper'>
            <div className='PromptLine'>
                <span className='PromptSymbol'>$</span>
                <input
                    type="text"
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    ref={inputRef}
                    disabled={isLoading}
                />
            </div>
            <div className='cmd-input-tools-wrapper'>
                <div className='cmd-input-left'>
                    <div className='cmd-input-tools upload' style={{ backgroundImage: `url(${upload})` }} />
                    <div className='cmd-input-tools upload-folder' style={{ backgroundImage: `url(${uploadFolder})` }} />
                </div>
                <div className='cmd-input-middle'>
                    <span
                        className='event-success text-xs text-center block whitespace-pre-wrap max-h-[2.5rem] overflow-hidden'
                        title={message || 'Adversarial Machine Learning Vehicle Framework'}
                    >
                        {message || 'Adversarial Machine Learning Vehicle Framework'}
                    </span>
                </div>
                <div className='cmd-input-right'>
                    <div className='cmd-input-tools stop' style={{ backgroundImage: `url(${isLoading ? stop : voice})` }} />
                </div>


            </div>

            {/* historyIndex */}
            {/* {historyIndex !== null && (
                <div className="history-debug">
                    <small>
                        Command {historyIndex + 1}/{commandHistory.length}
                    </small>
                </div>
            )} */}
        </form>
    );
}
