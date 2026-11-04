import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePreferencesStore } from '../../store/preferences/preferencesStore';
import { useCombatStore } from '../../combat/combatStore';
import { useNetworkStore } from '../../store/session/networkStore';
import { observeHudLayout, setHudStyle } from '../hud/observeHudLayout';
import './futuristicHUD.css';

/** One flow owner for statuses, resource bars and weapon buttons. Measure side
 * controls only on layout changes; telemetry never drives geometry polling. */
export function CenterCombatDock({children}: {children: ReactNode}) {
  const root = useRef<HTMLDivElement>(null);
  const groups = usePreferencesStore(s => s.hudGroups), touch = usePreferencesStore(s => s.showTouchControls), drive = usePreferencesStore(s => s.showDriveControls), drop = usePreferencesStore(s => s.wheelDrop);
  const armed = useCombatStore(s => s.enabled);
  const match = useNetworkStore(s => Boolean(s.snapshot?.match_state));
  useLayoutEffect(() => {
    const element = root.current, hud = element?.closest('.driving-hud');
    if (!element || !hud) return;
    const selector = '.wheel-hud,.drive-dock .hud-parking,.drive-dock .hud-shifter,.turret-aim-module,.drive-dock .turret-actions,.console-foot-controls > .hud-group,.console-foot-controls > .ignition-hud,.driving-chat,.hud-top-left,.instrument-hud,.hud-utilities';
    // Combat fallbacks are siblings of the driving HUD, not its descendants.
    // They still own screen space, including when the optional aim deck is off.
    const externalSelector = '.ctf-match-hud,.revive-action-fallback,.guard-boost-fallback,.vehicle-defeated-banner';
    const obstacles = () => [...hud.querySelectorAll(selector), ...document.querySelectorAll(externalSelector)];
    const readTargets = () => [element, ...obstacles()];
    const measure = () => {
      const width = hud.clientWidth, height = window.innerHeight, margin = 12, gap = 8;
      if (width <= 0 || height <= 0) return;
      // CSS owns the desired panel width. Only actual layout changes measure
      // this; a wider desktop panel still yields to the existing free lanes.
      const preferred = Number.parseFloat(window.getComputedStyle(element).maxWidth);
      const maximum = Math.min(Number.isFinite(preferred) ? preferred : width - margin * 2, width - margin * 2), minimum = Math.min(220, maximum);
      const occupied = obstacles().map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
      if (!element.style.width) setHudStyle(element, 'width', `${maximum}px`);
      // A narrow free lane can change the strip's height. Two layout passes
      // account for wrapping without polling geometry on vehicle snapshots.
      for (let pass = 0; pass < 2; pass++) {
        const stripHeight = element.getBoundingClientRect().height;
        const candidates = new Set([gap, height - gap - stripHeight]);
        for (const rect of occupied) {candidates.add(rect.bottom + gap);candidates.add(rect.top - gap - stripHeight);}
        let chosen: {x:number;y:number;width:number} | null = null;
        for (const y of [...candidates].sort((a,b) => b-a)) {
          if (y < gap || y + stripHeight > height - gap) continue;
          let lanes = [[margin, width - margin]];
          for (const rect of occupied) {
            if (rect.bottom + gap <= y || rect.top - gap >= y + stripHeight) continue;
            lanes = lanes.flatMap(([left,right]) => rect.right + gap <= left || rect.left - gap >= right ? [[left,right]] : [[left,Math.max(left,rect.left-gap)],[Math.min(right,rect.right+gap),right]]).filter(([left,right]) => right-left >= minimum);
          }
          const lane = lanes.sort((a,b) => (b[1]-b[0])-(a[1]-a[0]))[0];
          if (!lane) continue;
          const available = Math.min(maximum,lane[1]-lane[0]);
          const x = Math.max(lane[0],Math.min((width-available)/2,lane[1]-available));
          chosen = {x,y,width:available};break;
        }
        if (chosen) {
          setHudStyle(element, 'width', `${chosen.width}px`); setHudStyle(element, 'left', `${chosen.x}px`); setHudStyle(element, 'transform', 'none');
          setHudStyle(element, 'bottom', `${height-chosen.y-stripHeight}px`);
        }
      }
    };
    return observeHudLayout(hud, readTargets, measure, hud.parentElement ?? hud);
  }, [groups, touch, drive, drop, armed, match]);
  return <div ref={root} className="center-combat-dock">{children}</div>;
}
