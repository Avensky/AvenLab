import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useControlRelease } from "../../../controls/useControlRelease";
import { stalkPoint, stalkTangent, stalkStepAngle } from "./geometry";
/** One physical lever. Gesture code changes commands; geometry keeps the cap and
 * its adjacent buttons on the same arc. See this folder's README before edits. */
type Direction = -1 | 1;
type Gesture = {
  id: number | null;
  key: string | null;
  kind: "cap" | "step";
  angle: number;
  y: number;
  action: -1 | 0 | 1;
  heldAction: boolean;
};
export function Stalk({
  angle,
  reach = 31,
  spacing = 12.5,
  scale = 1,
  label,
  mode,
  asset,
  words,
  onUp,
  onDown,
  onTurn,
  onHold,
  onCancel,
  onRelease,
  disabled,
  repeat = false,
  detent = 0,
  latched = false,
}: {
  angle: number;
  reach?: number;
  spacing?: number;
  scale?: number;
  label: string;
  mode: string;
  asset: string;
  words: [string, string];
  onUp: () => void;
  onDown: () => void;
  onTurn: () => void;
  onHold?: (held: boolean) => void;
  onCancel?: () => void;
  onRelease?: (direction: Direction) => void;
  disabled: boolean;
  repeat?: boolean;
  detent?: number;
  latched?: boolean;
}) {
  const gesture = useRef<Gesture | null>(null),
    timer = useRef<number | null>(null),
    active = useRef<-1 | 0 | 1>(0),
    suppress = useRef(false),
    [pull, setPull] = useState(0);
  const [heldTarget, setHeldTarget] = useState<"cap" | Direction | null>(null);
  const holdTimer = useRef<number | null>(null),
    capHeld = useRef(false);
  const holdOwner = useRef<((held: boolean) => void) | undefined>(undefined);
  const callbacks = useRef({ onUp, onDown, onTurn, onRelease, onHold });
  useEffect(() => {
    callbacks.current = { onUp, onDown, onTurn, onRelease, onHold };
  }, [onUp, onDown, onTurn, onRelease, onHold]);
  // A cap tap rotates its mode. A deliberate hold is a temporary level input;
  // consuming the tap prevents release from also turning the lights on/off.
  const stopHold = useCallback(() => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (capHeld.current) holdOwner.current?.(false);
    capHeld.current = false;
    holdOwner.current = undefined;
  }, []);
  const armHold = () => {
    if (!callbacks.current.onHold) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      const held = gesture.current;
      if (!held || held.kind !== "cap" || held.action !== 0) return;
      held.heldAction = true;
      capHeld.current = true;
      holdOwner.current = callbacks.current.onHold;
      holdOwner.current?.(true);
    }, 220);
  };
  const stopAction = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const direction = active.current;
    active.current = 0;
    if (direction) callbacks.current.onRelease?.(direction);
  }, []);
  const release = useCallback(() => {
    gesture.current = null;
    stopHold();
    stopAction();
    setPull(0);
    setHeldTarget(null);
  }, [stopAction, stopHold]);
  useControlRelease(release);
  const supportsHold = Boolean(onHold);
  useEffect(() => release, [disabled, supportsHold, release]);
  const fire = (direction: Direction) => {
    active.current = direction;
    (direction === 1 ? callbacks.current.onUp : callbacks.current.onDown)();
    if (repeat && gesture.current?.action === direction)
      timer.current = window.setTimeout(() => {
        if (gesture.current?.action === direction) fire(direction);
      }, 350);
  };
  const tap = (direction: Direction) => {
    release();
    fire(direction);
    if (!latched) {
      setPull(direction);
      timer.current = window.setTimeout(release, 150);
    }
  };
  const polar = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget
      .closest(".wheel-assembly")
      ?.getBoundingClientRect();
    return r && r.width
      ? (Math.atan2(
          e.clientY - r.y - r.height / 2,
          e.clientX - r.x - r.width / 2,
        ) *
          180) /
          Math.PI
      : NaN;
  };
  const begin = (e: PointerEvent<HTMLButtonElement>, direction: -1 | 0 | 1) => {
    if (disabled || e.button !== 0 || gesture.current) return;
    e.preventDefault();
    e.stopPropagation();
    release();
    suppress.current = false;
    gesture.current = {
      id: e.pointerId,
      key: null,
      kind: direction ? "step" : "cap",
      angle: polar(e),
      y: e.clientY,
      action: direction,
      heldAction: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setHeldTarget(direction || "cap");
    if (direction) {
      if (!latched) setPull(direction);
      fire(direction);
    } else armHold();
  };
  const finish = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const held = gesture.current;
    if (!held || held.id !== e.pointerId) return;
    e.stopPropagation();
    release();
    suppress.current = true;
    if (!cancel && held.kind === "cap" && held.action === 0 && !held.heldAction)
      callbacks.current.onTurn();
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const keyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    step?: Direction,
  ) => {
    const direction =
      e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowDown"
          ? -1
          : step && (e.key === " " || e.key === "Enter")
            ? step
            : 0;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      release();
      onCancel?.();
      return;
    }
    const cap = !step && (e.key === " " || e.key === "Enter");
    if (!direction && !cap) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || gesture.current) return;
    release();
    suppress.current = false;
    gesture.current = {
      id: null,
      key: e.key,
      kind: cap ? "cap" : "step",
      angle: 0,
      y: 0,
      action: direction,
      heldAction: false,
    };
    setHeldTarget(step ?? "cap");
    if (direction) {
      if (!latched) setPull(direction);
      fire(direction);
    } else armHold();
  };
  const keyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (gesture.current?.key !== e.key) return;
    e.preventDefault();
    e.stopPropagation();
    const tap =
      gesture.current?.kind === "cap" &&
      !gesture.current.heldAction &&
      gesture.current.action === 0;
    release();
    suppress.current = false;
    if (tap) callbacks.current.onTurn();
  };
  const point = (a: number, r = reach) => stalkPoint(a, r);
  // Rotate one rigid assembly: cap, rod and both neighboring buttons retain
  // their spacing and turn together. Pointer capture keeps a held target owned
  // even while its painted face moves away from the original contact point.
  const position = latched ? detent : pull;
  const actuatorAngle =
    position === 0
      ? angle
      : stalkStepAngle(angle, position > 0 ? 1 : -1, Math.abs(position) * 7);
  return (
    <div
      className="stalk-actuator"
      data-latched={latched}
      data-detent={latched ? detent : pull}
      style={
        {
          "--stalk-scale": scale,
          transform: `rotate(${angle - actuatorAngle}deg)`,
        } as CSSProperties
      }
    >
      <span
        className="column-stalk-rod"
        style={
          {
            "--stalk-angle": `${-angle}deg`,
            width: `${reach}%`,
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <i />
      </span>
      <button
        type="button"
        className="column-stalk-cap"
        disabled={disabled}
        data-held={heldTarget === "cap"}
        aria-label={label}
        title={
          onHold
            ? `${label}: tap to rotate; hold for high beams; release restores the selected lights`
            : `${label}: hold a direction or drag; center changes mode`
        }
        style={
          {
            ...point(angle),
            "--stalk-tangent": `${stalkTangent(angle)}deg`,
          } as CSSProperties
        }
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => begin(e, 0)}
        onPointerMove={(e) => {
          const held = gesture.current;
          if (!held || held.id !== e.pointerId || held.kind !== "cap") return;
          e.stopPropagation();
          const a = polar(e),
            delta =
              Number.isFinite(a) && Number.isFinite(held.angle)
                ? ((a - held.angle + 540) % 360) - 180
                : held.y - e.clientY,
            direction = Math.abs(delta) < 9 ? 0 : delta > 0 ? 1 : -1;
          if (direction === held.action) return;
          stopHold();
          stopAction();
          held.action = direction;
          if (direction) held.heldAction = true; // A drag cannot also become a rotary tap.
          if (!latched) setPull(direction);
          if (direction) fire(direction);
        }}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
        onLostPointerCapture={(e) => finish(e, true)}
        onBlur={release}
        onClick={() => {
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          onTurn();
        }}
        onKeyDown={(e) => keyDown(e)}
        onKeyUp={keyUp}
      >
        <img src={`/images/${asset}`} alt="" />
        <span>{mode}</span>
      </button>
      {([1, -1] as const).map((direction, i) => {
        const a = stalkStepAngle(angle, direction, spacing);
        return (
          <button
            key={direction}
            type="button"
            className="stalk-step"
            disabled={disabled}
            data-held={heldTarget === direction}
            aria-label={`${label} ${direction === 1 ? "up" : "down"}`}
            style={{
              ...point(a),
              transform: `translate(-50%,-50%) rotate(${stalkTangent(a)}deg)`,
            }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => begin(e, direction)}
            onPointerUp={(e) => finish(e)}
            onPointerCancel={(e) => finish(e, true)}
            onLostPointerCapture={(e) => finish(e, true)}
            onBlur={release}
            onKeyDown={(e) => keyDown(e, direction)}
            onKeyUp={keyUp}
            onClick={() => {
              if (suppress.current) {
                suppress.current = false;
                return;
              }
              tap(direction);
            }}
          >
            {words[i]}
          </button>
        );
      })}
    </div>
  );
}
