import { useMotionView } from "../../store/session/networkViews";
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePreferencesStore } from '../../store/preferences/preferencesStore';
import { useCombatStore } from '../../combat/combatStore';

import { observeHudLayout, setHudStyle } from '../hud/observeHudLayout';
import './futuristicHUD.css';

/** One flow owner for statuses, resource bars and weapon buttons. Measure side
 * controls only on layout changes; telemetry never drives geometry polling. */
export function CenterCombatDock({children}: {children: ReactNode}) {
  const root = useRef<HTMLDivElement>(null);
  const groups = usePreferencesStore(s => s.hudGroups), touch = usePreferencesStore(s => s.showTouchControls), drive = usePreferencesStore(s => s.showDriveControls), drop = usePreferencesStore(s => s.wheelDrop);
  const armed = useCombatStore(s => s.enabled);
  const match = useMotionView(s => Boolean(s.snapshot?.match_state));
  useLayoutEffect(() => {
    const element = root.current, hud = element?.closest<HTMLElement>('.driving-hud');
    if (!element || !hud) return;
    const selector = '.wheel-hud,.wheel-ignition-station,.drive-dock .hud-parking,.drive-dock .hud-shifter,.turret-aim-module,.drive-dock .turret-actions,.console-foot-controls > .hud-group,.console-foot-controls > .ignition-hud,.driving-chat,.hud-top-left,.instrument-hud,.hud-utilities';
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
      if (groups.futuristic) {
        // The cluster uses the pedal bank’s bottom inset. When it cannot fit between the
        // physical controls, give it a separate bottom row and lift those controls.
        const wheel = hud.querySelector('.wheel-hud')?.getBoundingClientRect();
        const rightControls = Array.from(hud.querySelectorAll('.drive-dock .hud-parking,.drive-dock .hud-shifter,.drive-dock:not(:has(.hud-shifter)) .turret-aim-module,.console-foot-controls > .hud-group'))
          .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
        const keyWidth=hud.querySelector('.wheel-ignition-station')?.getBoundingClientRect().width??0;
        const keyLeft=wheel?.width?wheel.right+gap:margin;
        const left=keyLeft+(keyWidth?keyWidth+gap:0);
        setHudStyle(hud,'--key-left',keyLeft+'px');
        const right = Math.min(width - margin, ...rightControls.map(rect => rect.left - gap));
        const stacked = right - left < 315;

        // In landscape, use the clear lane left of the real pedals before
        // lifting the pedal bank. This also covers wide but shallow windows.
        const split = stacked && width>height && rightControls.length>0 && right-margin>=minimum;
        const keyOverlapsRight=keyWidth>0 && keyLeft+keyWidth>right;
        const lowestClearY=Math.min(height,...rightControls.filter(r=>r.right>keyLeft && r.left<keyLeft+keyWidth).map(r=>r.top));
        // Moving both stations together must not feed their translated positions back into the measurement.
        const previousRightLift=parseFloat(hud.style.getPropertyValue('--right-station-lift'))||0;
        const keyLift=keyOverlapsRight && !split ? Math.max(0,height-lowestClearY-previousRightLift+gap) : 0;
        setHudStyle(hud,'--key-lift',keyLift+'px');
        const available = split ? Math.min(520,maximum,right-margin) :
          stacked ? Math.min(520,maximum) : Math.min(maximum,right-left);
        const x = split ? right-available :
          stacked ? (width-available)/2 : Math.max(left,Math.min((width-available)/2,right-available));
        setHudStyle(element, 'width', `${available}px`);
        setHudStyle(element, 'left', `${x}px`);
        setHudStyle(element, 'bottom', 'var(--drive-sill)');
        setHudStyle(element, 'transform', 'none');
        const lift=stacked ? `${Math.ceil(element.getBoundingClientRect().height)+3}px` : '0px';
        setHudStyle(hud,'--station-lift',lift);
        setHudStyle(hud,'--right-station-lift',split?'0px':lift);
        return;
      }
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
    measure();
    const stop = observeHudLayout(hud, readTargets, measure, hud.parentElement ?? hud);
    return () => {
      stop();
      hud.style.removeProperty('--key-left');hud.style.removeProperty('--key-lift');
      hud.style.removeProperty('--station-lift');
      hud.style.removeProperty('--right-station-lift');
      for (const key of ['width', 'left', 'bottom', 'transform']) element.style.removeProperty(key);
    };
  }, [groups, touch, drive, drop, armed, match]);
  return <div ref={root} className="center-combat-dock">{children}</div>;
}
