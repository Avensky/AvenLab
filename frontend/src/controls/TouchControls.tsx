import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useInputStore, type InputSource } from "../store/inputStore";
import { canDrive } from "../store/tools/inputRouting";
import { useControlRelease } from "./useControlRelease";
import { usePreferencesStore } from "../store/preferencesStore";
import { wheelPoint } from "./wheelGeometry";


export function ActionButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" onKeyDown={event => {
    if (event.code !== "Space" && event.code !== "Enter") return;
    event.preventDefault(); event.stopPropagation(); if (!event.repeat && canDrive()) event.currentTarget.click();
  }} onKeyUp={event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); event.stopPropagation(); } }} />;
}

export function HoldButton({ onHold, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { onHold: (held: boolean) => void }) {
  const callback = useRef(onHold), pointer = useRef<number | null>(null), key = useRef(false), held = useRef(false);
  useEffect(() => { callback.current = onHold; }, [onHold]);
  const emit = useCallback(() => {
    const value = pointer.current !== null || key.current;
    if (value !== held.current) { held.current = value; callback.current(value); }
  }, []);
  const release = useCallback(() => { pointer.current = null; key.current = false; emit(); }, [emit]);
  useControlRelease(release);
  useEffect(() => { if (disabled) release(); }, [disabled, release]);
  return <button {...props} type="button" disabled={disabled}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      if (!canDrive() || event.button !== 0 || pointer.current !== null) return;
      event.preventDefault(); event.stopPropagation(); pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId); emit();
    }}
    onPointerUp={event => { event.stopPropagation(); if (event.pointerId === pointer.current) { pointer.current = null; emit(); } }}
    onPointerCancel={event => { if (event.pointerId === pointer.current) { pointer.current = null; emit(); } }}
    onLostPointerCapture={event => { if (event.pointerId === pointer.current) { pointer.current = null; emit(); } }}
    onKeyDown={event => {
      if (event.code !== "Space" && event.code !== "Enter") return;
      event.preventDefault(); event.stopPropagation(); if (!event.repeat && canDrive()) { key.current = true; emit(); }
    }}
    onKeyUp={event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); event.stopPropagation(); key.current = false; emit(); } }}
    onClick={event => { event.preventDefault(); event.stopPropagation(); }}
    onBlur={release} />;
}

export function TouchStick({ axis, wheel = false, children }: { axis: "steer" | "throttle"; wheel?: boolean; children?: ReactNode }) {
  const travel=usePreferencesStore(s=>s.steeringTravel);
  const [value, setValue] = useState(0), [point, setPoint] = useState({x:0,y:0}), pointer = useRef<number | null>(null);
  const source: InputSource = axis === "steer" ? "touch-steering" : "touch-throttle";
  const update = useCallback((next: number) => {
    setValue(next); useInputStore.getState().setAnalogFromSource(source, { [axis]: next });
  }, [axis, source]);
  const release = useCallback(() => { pointer.current = null; setValue(0); setPoint(p=>p.x===0&&p.y===0?p:{x:0,y:0}); useInputStore.getState().releaseInputSource(source); }, [source]);
  useControlRelease(release);
  const movement = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect(), radius = Math.min(rect.width, rect.height) * .33;
    if (wheel) {
      const next = wheelPoint(event.clientX - rect.x - rect.width / 2, event.clientY - rect.y - rect.height / 2, Math.min(rect.width,rect.height) * .43 * travel);
      setPoint(previous=>previous.x===next.x&&previous.y===next.y?previous:next);
      update(Math.abs(next.x)<.025?0:next.x);return;
    }
    const delta = axis === "steer" ? event.clientX - rect.x - rect.width / 2 : rect.y + rect.height / 2 - event.clientY;
    const raw = Math.max(-1, Math.min(1, delta / radius)); update(Math.abs(raw) < .08 ? 0 : raw);
  };
  return <div className={`touch-stick touch-stick-${axis}${wheel ? " steering-control" : ""}`} data-active={point.x!==0 || point.y!==0 || value!==0} role="slider" tabIndex={0} aria-label={wheel ? "Steering wheel" : axis === "steer" ? "Steering joystick" : "Acceleration and reverse joystick"}
    aria-description={wheel ? "Drag anywhere inside the wheel. Horizontal position controls steering; vertical movement only moves the thumb. Release to center." : undefined}
    aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-orientation={axis === "steer" ? "horizontal" : "vertical"}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => { if (!canDrive() || event.button !== 0 || pointer.current !== null) return; pointer.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); movement(event); }}
    onPointerMove={event => { if (pointer.current === event.pointerId) movement(event); }}
    onPointerUp={event => { if (pointer.current === event.pointerId) release(); }}
    onPointerCancel={event => { if (pointer.current === event.pointerId) release(); }}
    onLostPointerCapture={event => { if (pointer.current === event.pointerId) release(); }}
    onKeyDown={event => {
      const negative = axis === "steer" ? "ArrowLeft" : "ArrowDown", positive = axis === "steer" ? "ArrowRight" : "ArrowUp";
      if ([negative, positive, "Home", "Escape"].includes(event.code)) { event.preventDefault(); event.stopPropagation(); if (canDrive()) {
        const next=event.code===positive?(wheel?Math.min(1,value+.1):1):event.code===negative?(wheel?Math.max(-1,value-.1):-1):0;
        update(next);if(wheel)setPoint({x:next,y:0});
      } }
    }}
    onKeyUp={event => { if (event.code.startsWith("Arrow")) { event.preventDefault(); event.stopPropagation(); release(); } }} onBlur={() => { if (pointer.current === null) release(); }}>
    {children}
    {!wheel && <span className="touch-stick-axis" aria-hidden="true">{axis === "steer" ? "‹     ›" : "▲\n▼"}</span>}
    <span className="touch-stick-thumb" aria-hidden="true" style={wheel?{left:`${50+point.x*43*travel}%`,top:`${50+point.y*43*travel}%`}:{ transform: `translate(${axis === "steer" ? value * 26 : 0}px, ${axis === "throttle" ? -value * 26 : 0}px)` }} />
    {!wheel && <span className="touch-stick-label">{axis === "steer" ? "STEER" : "GAS / R"}</span>}
  </div>;
}
