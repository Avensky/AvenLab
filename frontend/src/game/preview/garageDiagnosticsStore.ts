import { create } from "zustand";
import { exhaustOutlets, lensProfiles } from "../../vehicles/tools/roadLamps";

export type GaragePoint = readonly [number, number, number];
export type GarageMount = "headlights" | "exhaust";
export type GarageLensStyle = "factory" | "clear" | "hidden";
type HeadlightMode = "off" | "low" | "high";
type SignalMode = "off" | "left" | "right" | "hazards";

export type GarageVehicleTest = {
  lights: HeadlightMode;
  signal: SignalMode;
  brake: boolean;
  nitrous: boolean;
  markers: boolean;
  lens: GarageLensStyle;
  positions: Record<GarageMount, Record<number, GaragePoint>>;
};

export const EMPTY_GARAGE_TEST: GarageVehicleTest = {
  lights: "off", signal: "off", brake: false, nitrous: false, markers: false, lens: "factory",
  positions: { headlights: {}, exhaust: {} },
};

export function garageMounts(vehicle: string, kind: GarageMount, test = EMPTY_GARAGE_TEST): GaragePoint[] {
  const profile = lensProfiles[vehicle];
  if (!profile) return [];
  const points = kind === "headlights" ? profile.mounts : exhaustOutlets[vehicle] ?? [];
  return points.map(([x, y, z], index) =>
    test.positions[kind][index] ?? [x, y + (kind === "exhaust" ? profile.floor : 0), z]);
}

export function garageLampState(test: GarageVehicleTest, elapsedTime: number): [number, number, number, number] {
  const blink = elapsedTime % 1 < .5 ? 2 : 1;
  return [
    test.lights === "high" ? 2 : test.lights === "low" ? 1 : 0,
    Number(test.brake),
    test.signal === "left" || test.signal === "hazards" ? blink : 0,
    test.signal === "right" || test.signal === "hazards" ? blink : 0,
  ];
}

type DiagnosticsState = {
  tests: Partial<Record<string, GarageVehicleTest>>;
  lensVehicle: string | null;
  lensCount: number;
  setLensCount: (vehicle: string | null, count: number) => void;
  update: (vehicle: string, change: Partial<Omit<GarageVehicleTest, "positions">>) => void;
  adjust: (vehicle: string, kind: GarageMount, index: number, axis: number, value: number) => void;
  reset: (vehicle: string) => void;
};

/** Only the current browser session owns these garage tests. No gameplay input,
 * profile write, or connection is needed to inspect a model. */
export const useGarageDiagnostics = create<DiagnosticsState>(set => ({
  tests: {},
  lensVehicle: null,
  lensCount: 0,
  setLensCount: (lensVehicle, lensCount) => set({ lensVehicle, lensCount }),
  update: (vehicle, change) => set(state => ({
    tests: { ...state.tests, [vehicle]: { ...(state.tests[vehicle] ?? EMPTY_GARAGE_TEST), ...change } },
  })),
  adjust: (vehicle, kind, index, axis, value) => set(state => {
    const test = state.tests[vehicle] ?? EMPTY_GARAGE_TEST;
    const current = garageMounts(vehicle, kind, test)[index];
    if (!current || !Number.isInteger(axis) || axis < 0 || axis > 2 || !Number.isFinite(value)) return state;
    const point: [number, number, number] = [...current];
    point[axis] = value;
    return {
      tests: { ...state.tests, [vehicle]: { ...test, markers: true,
        positions: { ...test.positions, [kind]: { ...test.positions[kind], [index]: point } },
      } },
    };
  }),
  reset: vehicle => set(state => {
    const tests = { ...state.tests };
    delete tests[vehicle];
    return { tests };
  }),
}));
