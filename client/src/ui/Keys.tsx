import { useState, useCallback, useEffect } from 'react'
import type { HTMLAttributes } from 'react'

import { keys } from '../keys'
import { useStore } from '../store'
import type { ActionInputMap, BindableActionName } from '../store'
import React from 'react'

const inputDisplayNameMap = {
    alt: 'Alt ⌥',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    arrowup: '↑',
    backspace: 'Backspace ⌫',
    capslock: 'CapsLock ⇪',
    control: 'Control ⌃',
    enter: 'Enter ↵',
    meta: 'Meta ⌘',
    shift: 'Shift ⇧',
    ' ': 'Space ␣',
    tab: 'Tab ⇥',
    headlights: 'f',
    blinkerLeft: '1',
    blinkerRight: '2',
    hazards: '3',
    engineOn: '4',
    reset: 'r',
    candump: '5'
} as const

type InputWithDisplayName = keyof typeof inputDisplayNameMap
const isInputWithDisplayName = (v: PropertyKey): v is InputWithDisplayName => Object.hasOwnProperty.call(inputDisplayNameMap, v)

const actionDisplayMap: Record<BindableActionName, { displayName: string; order: number }> = {
    backward: { displayName: 'Backward', order: 1 },
    boost: { displayName: 'Turbo Boost', order: 6 },
    brake: { displayName: 'Drift', order: 4 },
    camera: { displayName: 'Toggle Camera', order: 14 },
    editor: { displayName: 'Editor', order: 8 },
    forward: { displayName: 'Forward', order: 0 },
    headlights: { displayName: 'Headlights', order: 15 },
    blinkerLeft: { displayName: 'Left Blinker', order: 16 },
    blinkerRight: { displayName: 'Right Blinker', order: 17 },
    hazards: { displayName: 'Hazards', order: 18 },
    engineOn: { displayName: 'engineOn', order: 19 },
    menu: { displayName: 'Menu', order: 20 },
    help: { displayName: 'Help', order: 9 },
    honk: { displayName: 'Honk', order: 5 },
    cli: { displayName: 'Command Line Interface', order: 10 },
    left: { displayName: 'Left', order: 2 },
    map: { displayName: 'Map', order: 11 },
    pickcolor: { displayName: 'Pick Car Color', order: 12 },
    reset: { displayName: 'Reset', order: 7 },
    right: { displayName: 'Right', order: 3 },
    sound: { displayName: 'Toggle Mute', order: 13 },
    candump: { displayName: 'CanBus Logs', order: 21 },
    handbrake: { displayName: 'Hand Brake', order: 22 },
    throttle: { displayName: 'Throttle', order: 23 },
    steering: { displayName: 'Steering', order: 24 },
    dyno: { displayName: 'Dyno', order: 25 },
    liveCan: { displayName: 'LiveCan', order: 26 },
    radio: { displayName: 'Radio', order: 27 }
}

type RowProps = {
    actionName: BindableActionName
    hasError: boolean
    inputs: string[]
    onAdd: (actionName: BindableActionName) => void
    onRemove: (actionName: BindableActionName, inpput: string) => void
}

function Row({ actionName, hasError, inputs, onAdd, onRemove }: RowProps): React.JSX.Element {
    return (
        <div className={`keys-row popup-item${hasError ? ' with-error' : ''}`}>
            <div>{actionDisplayMap[actionName].displayName}</div>
            <div className="popup-item-keys">
                {inputs.map((input, key) => (
                    <button
                        key={key}
                        onClick={() => {
                            onRemove(actionName, input)
                        }}
                        className="key-button popup-item-key"
                    >
                        <span>{isInputWithDisplayName(input) ? inputDisplayNameMap[input] : input.toUpperCase()}</span>
                    </button>
                ))}
                <button
                    className="add-button popup-item-key hovered-item"
                    onClick={() => {
                        onAdd(actionName)
                    }}
                >
                    <span>+</span>
                </button>
            </div>
        </div>
    )
}

function Rows({ onAdd }: { onAdd: (actionName: BindableActionName) => void }) {
    const actionInputMap = useStore.getState().actionInputMap

    const onRemove = useCallback((actionName: BindableActionName, input: string) => {
        useStore.setState(({ actionInputMap, ...rest }) => {
            return { actionInputMap: { ...actionInputMap, [actionName]: actionInputMap[actionName].filter((v) => v !== input) }, ...rest }
        })
    }, [])

    return (
        <>
            {keys(actionInputMap)
                .sort((a, b) => actionDisplayMap[a].order - actionDisplayMap[b].order)
                .map((actionName, key) => (
                    <Row
                        key={key}
                        actionName={actionName}
                        inputs={actionInputMap[actionName]}
                        onRemove={onRemove}
                        onAdd={onAdd}
                        hasError={!actionInputMap[actionName].length}
                    />
                ))}
        </>
    )
}

type KeyInputProps = { onKeyup: (event: KeyboardEvent) => void }

function KeyInput({ onKeyup }: KeyInputProps): React.JSX.Element {
    useEffect(() => {
        window.addEventListener('keyup', onKeyup, { passive: true })

        return () => {
            window.removeEventListener('keyup', onKeyup)
        }
    }, [onKeyup])

    return (
        <div className="key-input-wrapper">
            <div className="key-input">Press new key</div>
        </div>
    )
}

type KeysProps = HTMLAttributes<HTMLDivElement>

export function Keys(props: KeysProps): React.JSX.Element {
    const [selectedAction, setSelectedAction] = useState<BindableActionName | null>(null)
    const actions = useStore.getState().actions;
    const binding = useStore.getState().booleans.binding

    const onAdd = useCallback(
        (action: BindableActionName) => {
            setSelectedAction(action)
            if (!binding) actions.binding()
        },
        [binding],
    )

    const onKeyup = useCallback(
        ({ key }: KeyboardEvent) => {
            if (!selectedAction) return
            const input = key.toLowerCase()
            if (input === 'escape') return setSelectedAction(null)
            useStore.setState(({ actionInputMap, ...rest }) => {
                return {
                    actionInputMap: keys(actionInputMap).reduce<ActionInputMap>(
                        (o, actionName) => ({
                            ...o,
                            [actionName]: actionName === selectedAction ? actionInputMap[actionName].concat(input) : actionInputMap[actionName].filter((v) => v !== input),
                        }),
                        {} as ActionInputMap,
                    ),
                    ...rest,
                }
            })
            setSelectedAction(null)
            if (binding) actions.binding()
        },
        [binding, selectedAction],
    )

    return (
        <>
            <div {...props}>
                <Rows onAdd={onAdd} />
            </div>
            {selectedAction && <KeyInput onKeyup={onKeyup} />}
        </>
    )
}
