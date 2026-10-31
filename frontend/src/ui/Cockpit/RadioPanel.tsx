import { RadioIcon } from "./RadioIcon";
import { memo, useEffect, useRef } from "react";
import { useMissionRadioStore } from "../../store/missions";
import {
  loadRadioFiles,
  nextRadioTrack,
  previousRadioTrack,
  restartRadio,
  setRadioVolume,
  setRadioPower,
  toggleRadio,
  toggleRadioMute,
  useRadioStore,
} from "../../store/radio/radioStore";
import { ResourceFlags } from "../../store/telemetry/resourceMasks";
import {
  startVehicleTelemetry,
  useVehicleTelemetryStore,
} from "../../store/telemetry/vehicleTelemetryStore";
import { RotaryKnob } from "./RotaryKnob";
import { useMomentaryFeedback } from "./useMomentaryFeedback";

// Only a changed notice redraws this line; vehicle ticks do not redraw the radio.
const RadioStatus = memo(function RadioStatus({
  fallback,
}: {
  fallback: string;
}) {
  useEffect(startVehicleTelemetry, []);
  const bulletin = useMissionRadioStore((s) => s.current);
  const notice = useVehicleTelemetryStore(
    ({ data: { signal, resourceMask: mask } }) =>
      signal === "offline"
        ? "LINK LOST"
        : signal === "stale"
          ? "NO SIGNAL"
          : signal !== "live"
            ? "WAITING"
            : mask & ResourceFlags.STARVED
              ? "FUEL EMPTY"
              : mask & ResourceFlags.HEAT_LOCK
                ? "COOL ENGINE"
                : mask & ResourceFlags.HOT
                  ? "ENGINE HOT"
                  : mask & ResourceFlags.LOW_FUEL
                    ? "LOW FUEL"
                    : mask & ResourceFlags.DAMAGED
                      ? "REPAIR"
                      : mask & ResourceFlags.STARTING
                        ? "STARTING"
                        : "",
  );
  return (
    <small
      className="radio-vehicle-status"
      data-alert={Boolean(notice)}
      role={notice ? "status" : undefined}
      title={notice || bulletin?.message || fallback}
    >
      {notice ||
        (bulletin
          ? `${bulletin.kind === "complete" ? "MISSION COMPLETE · " : ""}${bulletin.title}`
          : fallback)}
    </small>
  );
});
export function RadioPanel({
  compact = false,
  minimized = false,
  onMinimize,
}: {
  compact?: boolean;
  minimized?: boolean;
  onMinimize?: () => void;
}) {
  const radio = useRadioStore(),
    file = useRef<HTMLInputElement>(null);
  const feedback = useMomentaryFeedback();
  return (
    <div
      {...feedback}
      className="cockpit-radio"
      data-compact={compact}
      data-powered={radio.powered}
    >
      <div className="radio-display">
        <strong>
          {radio.powered ? radio.title || radio.track : "RADIO OFF"}
        </strong>
        {radio.powered && (
          <RadioStatus fallback={radio.artist || radio.station} />
        )}
        <button
          type="button"
          className="radio-power"
          aria-label="Radio power"
          role="switch"
          aria-checked={radio.powered}
          title={radio.powered ? "Turn radio off" : "Turn radio on"}
          onClick={() => void setRadioPower(!radio.powered)}
        >
          <RadioIcon name="power" />
        </button>
        {onMinimize && (
          <button
            type="button"
            className="component-minimize"
            aria-label={minimized ? "Expand radio" : "Minimize radio"}
            aria-expanded={!minimized}
            onClick={onMinimize}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d={minimized ? "M12 5v14M5 12h14" : "M5 12h14"} />
            </svg>
          </button>
        )}
      </div>
      <div className="radio-transport">
        <button
          type="button"
          aria-label="Radio previous track"
          title="Previous / replay"
          disabled={!radio.powered || !radio.trackCount}
          onClick={() => void previousRadioTrack()}
        >
          <RadioIcon name="previous" />
        </button>
        <button
          type="button"
          aria-label="Radio play or pause"
          disabled={!radio.powered}
          onClick={() => void toggleRadio()}
          aria-pressed={radio.playing}
        >
          <RadioIcon name={radio.playing ? "pause" : "play"} />
        </button>
        <button
          type="button"
          aria-label="Radio next track"
          title="Next track"
          disabled={!radio.powered || radio.trackCount < 2}
          onClick={() => void nextRadioTrack()}
        >
          <RadioIcon name="next" />
        </button>
        <button
          type="button"
          aria-label="Radio restart track"
          title="Start from beginning"
          disabled={!radio.powered || !radio.trackCount}
          onClick={restartRadio}
        >
          <RadioIcon name="restart" />
        </button>
        <button
          type="button"
          aria-label="Radio source"
          title="Select audio files"
          onClick={() => file.current?.click()}
        >
          <RadioIcon name="source" />
        </button>
        <div className="radio-volume-dial">
          <RotaryKnob
            label="Radio volume"
            disabled={!radio.powered}
            min={0}
            max={20}
            value={Math.round(radio.volume * 20)}
            readout={String(Math.round(radio.volume * 100))}
            onChange={(v) => setRadioVolume(v / 20)}
            action="Radio mute"
            actionText={radio.muted ? "×" : "♪"}
            active={radio.muted}
            onAction={toggleRadioMute}
          />
        </div>
      </div>
      {radio.powered && radio.message && (
        <span className="radio-status" role="status">
          {radio.message}
        </span>
      )}
      <input
        ref={file}
        type="file"
        accept="audio/*"
        multiple
        hidden
        aria-label="Choose local audio"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void loadRadioFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
