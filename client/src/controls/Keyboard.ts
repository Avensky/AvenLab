import { useEffect } from 'react'
import { keys } from '../keys'
import { isControl, useStore } from '../store'
import type { BindableActionName } from '../store'
import socket from '../socket'

export function Keyboard() {
  const binding = useStore((state) => state.booleans.binding)
  const actionInputMap = useStore((state) => state.actionInputMap)
  const actions = useStore((state) => state.actions)

  useEffect(() => {
    if (binding) return
    const keyMap: Partial<Record<string, BindableActionName>> = keys(actionInputMap).reduce(
      (out, actionName) => ({ ...out, ...actionInputMap[actionName].reduce((inputs, input) => ({ ...inputs, [input]: actionName }), {}) }),
      {},
    )
    const downHandler = (e: KeyboardEvent) => {
      const actionName = keyMap[e.key.toLowerCase()]
      if (e.key.toLowerCase() === "r") {
        socket.emit("controls", { reset: true });
        return; // ⬅ prevent further processing for 'r'
      }

      if (!actionName || (e.target as HTMLElement).nodeName === 'INPUT' || !isControl(actionName)) return
      actions[actionName](true)
      socket.emit('controls', useStore.getState().controls)
    }
    const upHandler = (e: KeyboardEvent) => {
      const actionName = keyMap[e.key.toLowerCase()]
      if (!actionName || (e.target as HTMLElement).nodeName === 'INPUT') return
      actions[actionName](false)
      socket.emit('controls', useStore.getState().controls)
    }

    window.addEventListener('keydown', downHandler, { passive: true })
    window.addEventListener('keyup', upHandler, { passive: true })

    return () => {
      window.removeEventListener('keydown', downHandler)
      window.removeEventListener('keyup', upHandler)
    }
  }, [actionInputMap, binding])

  return null
}
