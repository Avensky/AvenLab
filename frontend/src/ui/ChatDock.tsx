import { useLayoutEffect, useRef } from 'react';
import { LobbyChat } from '../game/alpha/LobbyChat';
import { usePreferencesStore } from '../store/preferences';
import { observeHudLayout, setHudStyle } from './hud/observeHudLayout';

export function ChatDock() {
  const root = useRef<HTMLDivElement>(null);
  const drop = usePreferencesStore(state => state.wheelDrop);
  useLayoutEffect(() => {
    const chat = root.current, hud = chat?.closest('.driving-hud');
    if (!chat || !hud) return;
    const nodes = () => Array.from(hud.querySelectorAll('.wheel-stage,.hud-top-left'));
    return observeHudLayout(hud, nodes, () => {
      const wheel = hud.querySelector('.wheel-stage')?.getBoundingClientRect();
      const roster = hud.querySelector('.hud-top-left')?.getBoundingClientRect();
      const top = wheel?.top ?? window.innerHeight - 12;
      setHudStyle(chat, 'bottom', Math.max(6, window.innerHeight-top+3)+'px');
      setHudStyle(chat, 'max-height', Math.max(30, top-(roster?.bottom ?? 0)-6)+'px');
    });
  }, [drop]);
  return <div ref={root} className="driving-chat"><LobbyChat driving /></div>;
}
