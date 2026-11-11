import { useState } from "react";
import {
  EMPTY_GARAGE_TEST, garageMounts, useGarageDiagnostics,
  type GarageMount, type GaragePoint, type GarageVehicleTest,
} from "./garageDiagnosticsStore";
import "./garageDiagnostics.css";

const axes = ["X", "Y", "Z"];
const lightModes = { off: "Off", low: "Low beam", high: "High beam" } as const;
const signalModes = { off: "Off", left: "Left", right: "Right", hazards: "Hazards" } as const;
const lensStyles = { factory: "Factory", clear: "Clear", hidden: "Hidden" } as const;

function Choices<T extends string>({ label, modes, active, choose }: {
  label: string;
  modes: Record<T, string>;
  active: T;
  choose: (mode: T) => void;
}) {
  return <fieldset className="garage-test-row">
    <legend>{label}</legend>
    {(Object.entries(modes) as [T, string][]).map(([mode, name]) => (
      <button key={mode} type="button" className="menu-control" aria-pressed={mode === active}
        onClick={() => choose(mode)}>{name}</button>
    ))}
  </fieldset>;
}

function Mounts({ vehicle, kind, points }: { vehicle: string; kind: GarageMount; points: GaragePoint[] }) {
  const adjust = useGarageDiagnostics(state => state.adjust);
  const title = kind === "headlights" ? "Headlight" : "Nitrous";
  return <fieldset className="garage-test-mounts">
    <legend>{title} positions</legend>
    {points.map((point, index) => {
      const label = kind === "headlights" ? (index === 0 ? "Left lamp" : "Right lamp") : `Outlet ${index + 1}`;
      return <div key={index} className="garage-test-coordinates">
        <strong>{label}</strong>
        {point.map((value, axis) => (
          <label key={`${axis}:${value}`}>{axes[axis]}
            <input type="number" aria-label={`${label} ${axes[axis]} in metres`}
              defaultValue={Number(value.toFixed(4))} step="0.01"
              onBlur={event => {
                const next = event.currentTarget.valueAsNumber;
                if (Number.isFinite(next) && next !== Number(value.toFixed(4))) adjust(vehicle, kind, index, axis, next);
                else event.currentTarget.value = String(Number(value.toFixed(4)));
              }}
              onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          </label>
        ))}
      </div>;
    })}
  </fieldset>;
}

export function GarageVehicleDiagnostics({ vehicle }: { vehicle: string }) {
  const test = useGarageDiagnostics(state => state.tests[vehicle] ?? EMPTY_GARAGE_TEST);
  const lensCount = useGarageDiagnostics(state => state.lensVehicle === vehicle ? state.lensCount : null);
  const update = useGarageDiagnostics(state => state.update);
  const reset = useGarageDiagnostics(state => state.reset);
  const [copyStatus, setCopyStatus] = useState("");
  const headlights = garageMounts(vehicle, "headlights", test);
  const exhaust = garageMounts(vehicle, "exhaust", test);
  const change = (next: Partial<Omit<GarageVehicleTest, "positions">>) => update(vehicle, next);

  async function copyPositions() {
    const values = (points: GaragePoint[]) => points.map(point => point.map(value => Number(value.toFixed(4))));
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        vehicle, units: "metres", coordinates: "X left, Y up, Z forward (GLB origin)",
        headlights: values(headlights), nitrous: values(exhaust),
      }, null, 2));
      setCopyStatus("Positions copied.");
    } catch {
      setCopyStatus("Clipboard unavailable.");
    }
  }

  if (!headlights.length && !exhaust.length) return <section className="vehicle-studio-card">
    <header><small>GARAGE TEST</small><h3>Lighting and nitrous</h3></header>
    <p>This model has no calibrated road lights or nitrous outlets.</p>
  </section>;

  return <>
    <section className="vehicle-studio-card garage-diagnostics" aria-label="Garage lamp tests">
      <header><small>GARAGE TEST</small><h3>Lights</h3></header>
      <Choices label="Headlights" modes={lightModes} active={test.lights} choose={lights => change({ lights })} />
      <Choices label="Turn signals" modes={signalModes} active={test.signal} choose={signal => change({ signal })} />
      <div className="garage-test-row">
        <button type="button" className="menu-control" aria-pressed={test.brake}
          onClick={() => change({ brake: !test.brake })}>Brake lights</button>
      </div>
      {lensCount ? <Choices label="Headlight glass" modes={lensStyles} active={test.lens}
        choose={lens => change({ lens })} /> : <p>{lensCount === null ? "Checking headlight glass…" : "No separate headlight covers in this model."}</p>}
    </section>
    <section className="vehicle-studio-card garage-diagnostics" aria-label="Garage placement tests">
      <header><small>MODEL METRES · X LEFT, Y UP, Z FORWARD</small><h3>Mount positions</h3></header>
      <div className="garage-test-row">
        <button type="button" className="menu-control" aria-pressed={test.markers}
          onClick={() => change({ markers: !test.markers })}>Mount markers</button>
        {exhaust.length > 0 && <button type="button" className="menu-control" aria-pressed={test.nitrous}
          onClick={() => change({ nitrous: !test.nitrous })}>Nitrous flames</button>}
      </div>
      <Mounts vehicle={vehicle} kind="headlights" points={headlights} />
      {exhaust.length > 0 && <Mounts vehicle={vehicle} kind="exhaust" points={exhaust} />}
      <div className="garage-test-row">
        <button type="button" className="menu-control" onClick={() => void copyPositions()}>Copy positions</button>
        <button type="button" className="menu-control" onClick={() => { reset(vehicle); setCopyStatus(""); }}>Reset tests</button>
      </div>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </section>
  </>;
}
