/** Ratcheting parking cable: hold builds tension; a tap releases the latch.
 * The driving-only drift lever is a separate momentary force, not this latch. */
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useControlRelease } from "../../../controls/useControlRelease";
import { requestParkingStrength } from "./commands";
import { parkingLeverPose } from "./geometry";
import { ParkingDetents, ParkingLeverArtwork } from "./ParkingArtwork";
import { usePreferencesStore } from "../../../store/preferences/index";
import { useMomentaryFeedback } from "../useMomentaryFeedback";

export function HandbrakeLever({
  strength,
  disabled,
  pending,
}: {
  strength: number;
  disabled: boolean;
  pending: boolean;
}) {
  const appearance = usePreferencesStore((s) => s.parkingBrakeStyle);
  const contact = useMomentaryFeedback();
  const handle = useRef<HTMLSpanElement>(null),
    start = useRef<{
      id: number | null;
      key: string | null;
      y: number;
      level: number;
      charged: boolean;
      moved: boolean;
    } | null>(null),
    suppressClick = useRef(false),
    timer = useRef<number | null>(null);
  const pose = parkingLeverPose(strength);
  const set = requestParkingStrength;
  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (start.current) suppressClick.current = true;
    start.current = null;
    if (handle.current) handle.current.style.removeProperty("transform");
  }, []);
  useControlRelease(clear);
  useEffect(() => {
    if (disabled) clear();
  }, [disabled, clear]);
  const charge = () => {
    const held = start.current;
    if (!held || held.moved) return;
    held.charged = true;
    const next = Math.min(3, held.level + 1);
    if (next !== held.level) {
      held.level = next;
      set(next);
    }
    timer.current = next < 3 ? window.setTimeout(charge, 300) : null;
  };
  const begin = (id: number | null, key: string | null, y = 0) => {
    if (disabled || start.current) return;
    suppressClick.current = false;
    start.current = {
      id,
      key,
      y,
      level: strength,
      charged: false,
      moved: false,
    };
    timer.current = window.setTimeout(charge, 250);
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = start.current;
    if (!current || current.id !== event.pointerId) return;
    start.current = null;
    clear();
    suppressClick.current = true;
    if (!cancel && !current.charged && !current.moved) set(0);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.moved && !cancel)
      set(
        Math.max(
          0,
          Math.min(
            3,
            current.level + Math.round((current.y - event.clientY) / 28),
          ),
        ),
      );
  };
  return (
    <section
      {...contact}
      className="mechanical-handbrake"
      data-parking-style={appearance}
      style={
        {
          "--parking-level": strength,
          "--parking-angle": `${pose.angle}deg`,
          "--parking-reach": pose.reach,
        } as CSSProperties
      }
    >
      <ParkingDetents strength={strength} disabled={disabled} onSelect={set} />
      <button
        type="button"
        className="handbrake-lever"
        disabled={disabled}
        aria-label="Parking brake"
        aria-description={`${Math.round((strength / 3) * 100)} percent; hold to increase brake strength, tap to release`}
        aria-pressed={strength > 0}
        data-active={strength > 0}
        aria-busy={pending}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          set(0);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || start.current) return;
          event.preventDefault();
          event.stopPropagation();
          begin(event.pointerId, null, event.clientY);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = start.current;
          if (!current || current.id !== event.pointerId) return;
          const dy = current.y - event.clientY;
          current.moved ||= Math.abs(dy) > 8;
          if (current.moved) {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            if (handle.current) {
              const next = parkingLeverPose(current.level + dy / 28);
              handle.current.style.transform = `rotate(${next.angle}deg) scaleX(${next.reach})`;
            }
          }
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onBlur={clear}
        onKeyDown={(event) => {
          if (event.code === "Space" || event.code === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) begin(null, event.code);
          }
        }}
        onKeyUp={(event) => {
          if (event.code === "Space" || event.code === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            const held = start.current;
            if (held?.key === event.code) {
              const charged = held.charged;
              clear();
              suppressClick.current = false;
              if (!charged) set(0);
            }
          }
        }}
      >
        <ParkingLeverArtwork handleRef={handle} />
      </button>
      <small>{pending ? "BRAKE REQUESTED" : "REAR PARKING BRAKE"}</small>
    </section>
  );
}
