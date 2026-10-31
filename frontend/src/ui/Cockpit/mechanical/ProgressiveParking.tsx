import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useControlRelease } from "../../../controls/useControlRelease";
import { useInputStore } from "../../../store/input/inputStore";
import { usePreferencesStore } from "../../../store/preferences/index";
import { requestParkingFraction, requestParkingStrength } from "./commands";
import { ParkingDetents, ParkingLeverArtwork } from "./ParkingArtwork";
import { parkingLeverPose } from "./geometry";
import { PARKING_TAP_MS, parkingPressureAfterHold } from "./pressure";

type Pull = {
  pointer: number | null;
  key: string | null;
  began: number;
  initial: number;
  y: number;
  drag: boolean;
};

/** One cable control for HUD and cockpit. Only an active pull runs a 20 Hz
 * timer; the existing sender transports pressure and Rust owns the latch.
 * A tap releases pressure; release after a hold keeps it. The metal tip also
 * releases the cable. Pose is feedback;
 * neither the button nor its artwork needs a held border or glow. */
export function ProgressiveParking({
  strength,
  fraction = strength / 3,
  precise = true,
  disabled,
  pending,
}: {
  strength: number;
  fraction?: number;
  precise?: boolean;
  disabled: boolean;
  pending: boolean;
}) {
  const appearance = usePreferencesStore((s) => s.parkingBrakeStyle);
  const momentary = useInputStore((s) => s.input.handbrake);
  const [drawn, setDrawn] = useState(fraction);
  const value = useRef(fraction),
    pull = useRef<Pull | null>(null);
  const pulse = useRef<number | null>(null);
  const timer = useRef<number | null>(null),
    suppressClick = useRef(false);
  const clear = useCallback(() => {
    if (pulse.current !== null) window.clearTimeout(pulse.current);
    pulse.current = null;
    useInputStore.getState().releaseInputSource("ebrake-pull");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (pull.current && pull.current.pointer !== null)
      suppressClick.current = true;
    pull.current = null;
  }, []);
  useControlRelease(clear);
  useEffect(() => {
    if (disabled) clear();
  }, [disabled, clear]);
  useEffect(() => {
    if (!pull.current) {
      value.current = fraction;
      setDrawn(fraction);
    }
  }, [fraction]);
  const change = (next: number) => {
    const force = Math.max(0, Math.min(1, next));
    const applied = precise
      ? Math.round(force * 1000) / 1000
      : Math.ceil(force * 3) / 3;
    value.current = applied;
    setDrawn(applied);
    if (precise) requestParkingFraction(applied);
    else requestParkingStrength(applied * 3);
  };
  const tick = () => {
    const held = pull.current;
    if (!held || held.drag) return;
    useInputStore.getState().releaseInputSource("ebrake-pull");
    const next = parkingPressureAfterHold(
      held.initial,
      performance.now() - held.began - PARKING_TAP_MS,
    );
    change(next);
    timer.current = next < 1 ? window.setTimeout(tick, 50) : null;
  };
  const begin = (pointer: number | null, key: string | null, y = 0) => {
    if (disabled || pull.current) return;
    suppressClick.current = false;
    pull.current = {
      pointer,
      key,
      y,
      began: performance.now(),
      initial: value.current,
      drag: false,
    };
    // One quick contact pulls immediately and releases with its pointer.
    // A longer hold switches to the existing progressive parking latch.
    if (value.current === 0)
      useInputStore
        .getState()
        .setAnalogFromSource("ebrake-pull", { handbrake: 1 });
    timer.current = window.setTimeout(tick, PARKING_TAP_MS + 50);
  };
  const finish = (cancel = false) => {
    const held = pull.current;
    if (held && !cancel && !held.drag) {
      const elapsed = performance.now() - held.began;
      change(
        elapsed <= PARKING_TAP_MS
          ? 0
          : parkingPressureAfterHold(held.initial, elapsed - PARKING_TAP_MS),
      );
    }
    clear();
  };
  const pose = parkingLeverPose(Math.max(drawn, momentary) * 3);
  return (
    <section
      className="mechanical-handbrake drift-parking progressive-parking"
      data-parking-style={appearance}
      data-parking-fraction={drawn}
      style={
        {
          "--parking-angle": `${pose.angle}deg`,
          "--parking-reach": pose.reach,
          "--parking-fraction": Math.max(drawn, momentary),
        } as CSSProperties
      }
    >
      <ParkingDetents
        strength={drawn * 3}
        disabled={disabled}
        onSelect={(level) => {
          clear();
          change(level / 3);
        }}
      />
      <button
        type="button"
        className="handbrake-lever"
        disabled={disabled}
        aria-label="Parking brake"
        aria-busy={pending}
        aria-pressed={drawn > 0 || momentary > 0}
        aria-description={`${Math.round(drawn * 100)} percent; quick press pulls and releases the e-brake. Tap to release a parked latch; hold to increase parking pressure. The metal tip releases the latch.`}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 || disabled || pull.current) return;
          e.preventDefault();
          e.stopPropagation();
          begin(e.pointerId, null, e.clientY);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const held = pull.current;
          if (!held || held.pointer !== e.pointerId) return;
          const delta = held.y - e.clientY;
          if (!held.drag && Math.abs(delta) < 8) return;
          held.drag = true;
          useInputStore.getState().releaseInputSource("ebrake-pull");
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = null;
          change(
            held.initial + delta / Math.max(80, e.currentTarget.clientHeight),
          );
        }}
        onPointerUp={(e) => {
          if (pull.current?.pointer !== e.pointerId) return;
          e.stopPropagation();
          finish();
          if (e.currentTarget.hasPointerCapture?.(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          if (pull.current?.pointer === e.pointerId) finish(true);
        }}
        onLostPointerCapture={(e) => {
          if (pull.current?.pointer === e.pointerId) finish(true);
        }}
        onBlur={clear}
        onKeyDown={(e) => {
          if (e.code === "Space" || e.code === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) begin(null, e.code);
          } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            clear();
            change(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 1
                  : value.current + (e.key === "ArrowUp" ? 0.05 : -0.05),
            );
          }
        }}
        onKeyUp={(e) => {
          if (pull.current?.key !== e.code) return;
          e.preventDefault();
          e.stopPropagation();
          finish();
          suppressClick.current = false;
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          // Click-only assistive activation pulses once; pointerup suppresses
          // its synthesized click so a physical quick pull cannot repeat.
          const wasParked = value.current > 0;
          change(0);
          if (!wasParked) {
            useInputStore
              .getState()
              .setAnalogFromSource("ebrake-pull", { handbrake: 1 });
            pulse.current = window.setTimeout(() => {
              pulse.current = null;
              useInputStore.getState().releaseInputSource("ebrake-pull");
            }, 100);
          }
        }}
      >
        <span className="parking-artwork">
          <ParkingLeverArtwork />
        </span>
      </button>
      <span className="parking-artwork parking-release-track">
        <span className="parking-release-arm">
          <button
            type="button"
            className="parking-release"
            aria-label="Release parked brake"
            disabled={disabled || drawn === 0}
            onClick={() => {
              clear();
              change(0);
            }}
          />
        </span>
      </span>
    </section>
  );
}
