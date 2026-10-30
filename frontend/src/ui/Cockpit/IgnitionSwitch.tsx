/** Key interactions and confirmed engine feedback. Artwork lives in ignition/;
 * every exit path returns START to ON and stops only this key's relay-audio owner. */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useControlRelease } from "../../controls/useControlRelease";
import { useInputStore } from "../../store/input/inputStore";
import { useCockpitState } from "./useCockpitState";
import { useVehicleTelemetryStore } from "../../store/telemetry/vehicleTelemetryStore";
import { ResourceFlags } from "../../store/telemetry/resourceMasks";
import { starterRelayAudio } from "./starterRelayAudio";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
import {
  IGNITION_POSITIONS as positions,
  IgnitionArtwork,
} from "./ignition/index";
type Press = {
  id: number | null;
  key: string | null;
  angle: number;
  initial: number;
  phase: number;
  advanced: boolean;
  dragged: boolean;
};

export function IgnitionSwitch() {
  const contact = useMomentaryFeedback();
  const { extended, confirmedCabin: state, cabinMask } = useCockpitState();
  const engineState = useVehicleTelemetryStore((s) =>
    s.data.signal !== "live"
      ? "unavailable"
      : s.data.engineOn
        ? "running"
        : (s.data.resourceMask ?? 0) & ResourceFlags.STARTING
          ? "cranking"
          : "off",
  );
  const audioOwner = useRef(Symbol("ignition"));
  const gradient = useId().replaceAll(":", ""),
    press = useRef<Press | null>(null),
    timer = useRef<number | null>(null),
    suppress = useRef(false);
  const [heldPhase, setHeldPhase] = useState<number | null>(null);
  useEffect(() => {
    const owner = audioOwner.current;
    starterRelayAudio.setCranking(
      owner,
      engineState === "cranking" && heldPhase === 3,
    );
    return () => starterRelayAudio.setCranking(owner, false);
  }, [engineState, heldPhase]);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const release = useCallback(() => {
    clearTimer();
    const held = press.current;
    press.current = null;
    setHeldPhase(null);
    if (held) suppress.current = true;
    const store = useInputStore.getState();
    if ((((store.input.cabin_mask ?? 0) >>> 10) & 3) === 3)
      store.setIgnition(2, true);
  }, [clearTimer]);
  useControlRelease(release);
  useEffect(() => release, [extended, release]);
  const send = (phase: number, inserted = true) =>
    useInputStore
      .getState()
      .setIgnition(phase, inserted, cabinMask ?? undefined);
  const off = () => {
    release();
    send(0);
  };
  const advance = () => {
    const held = press.current;
    if (!held) return;
    held.advanced = true;
    held.phase = Math.min(3, held.phase + 1);
    setHeldPhase(held.phase);
    send(held.phase);
    timer.current = held.phase < 3 ? window.setTimeout(advance, 300) : null;
  };
  const begin = (id: number | null, key: string | null, angle = 0) => {
    if (!extended || press.current) return;
    starterRelayAudio.unlock();
    clearTimer();
    suppress.current = false;
    const phase = Math.min(2, state.ignition);
    press.current = {
      id,
      key,
      angle,
      initial: phase,
      phase,
      advanced: false,
      dragged: false,
    };
    setHeldPhase(phase);
    timer.current = window.setTimeout(advance, 250);
  };
  const choose = (phase: number) => {
    release();
    send(phase);
  };
  const angle = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (
      (Math.atan2(
        e.clientY - r.y - r.height / 2,
        e.clientX - r.x - r.width / 2,
      ) *
        180) /
      Math.PI
    );
  };
  const finish = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const held = press.current;
    if (!held || held.id !== e.pointerId) return;
    const tap = !held.advanced && !held.dragged;
    release();
    if (!cancel && tap) send(0);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const shown = heldPhase ?? state.ignition;
  return (
    <div
      {...contact}
      className="ignition-system"
      data-engine-state={engineState}
      data-cranking={engineState === "cranking"}
      data-ignition={positions[shown]}
      data-key-inserted={heldPhase !== null || state.keyInserted}
      data-holding={heldPhase !== null}
    >
      <button
        type="button"
        className="ignition-cylinder"
        disabled={!extended}
        aria-label="Ignition key"
        aria-description="Tap to switch off. Hold to turn through ACC, ON and START. Releasing START returns to ON. In the cockpit, hold controller A or Enter. Arrow keys select OFF, ACC or ON; End holds START; Home switches off and Delete removes the key while off."
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          off();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || press.current) return;
          e.preventDefault();
          e.stopPropagation();
          begin(e.pointerId, null, angle(e));
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const held = press.current;
          if (!held || held.id !== e.pointerId) return;
          e.stopPropagation();
          const delta = ((angle(e) - held.angle + 540) % 360) - 180;
          if (Math.abs(delta) <= 10) return;
          clearTimer();
          held.dragged = true;
          held.advanced = true;
          const phase = Math.max(
            0,
            Math.min(3, held.initial + Math.round(delta / 45)),
          );
          if (phase !== held.phase) {
            held.phase = phase;
            setHeldPhase(phase);
            send(phase);
          }
        }}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
        onLostPointerCapture={(e) => finish(e, true)}
        onBlur={release}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) begin(null, e.key);
            return;
          }
          if (e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) {
              begin(null, "End");
              if (press.current) {
                clearTimer();
                press.current.phase = 3;
                press.current.advanced = true;
                setHeldPhase(3);
                send(3);
              }
            }
            return;
          }
          const dir =
            e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (dir || ["Home", "End", "Delete"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) return;
            if (e.key === "Delete") {
              if (state.ignition === 0) {
                release();
                send(0, !state.keyInserted);
              }
            } else
              choose(
                e.key === "Home"
                  ? 0
                  : Math.max(0, Math.min(2, state.ignition + dir)),
              );
          }
        }}
        onKeyUp={(e) => {
          if (![" ", "Enter", "End"].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          const held = press.current;
          if (held?.key === e.key) {
            const tap = !held.advanced;
            release();
            suppress.current = false;
            if (tap) send(0);
          }
        }}
      >
        <IgnitionArtwork
          gradient={gradient}
          shown={shown}
          holding={heldPhase !== null}
          keyInserted={state.keyInserted}
        />
      </button>
    </div>
  );
}
