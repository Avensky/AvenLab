export const degrees = (radians: number) => radians * 180 / Math.PI;

export const MPH_TO_KPH = 1.609344;
export const SPEED_START = Math.PI / 3;
export const SPEED_SWEEP = 4 * Math.PI / 3;
export const SPEED_MAX_KPH = 260;
export const SPEED_MAX_MPH = 160;

export interface DialTick { value: number; angle: number; major: boolean; medium: boolean }

// Build a scale once, rather than painting or counting its marks per frame.
export function linearTicks(max: number, minorStep: number, majorStep: number, angleFor: (value: number) => number): readonly DialTick[] {
  if (!(max > 0 && minorStep > 0 && majorStep >= minorStep) || !Number.isInteger(max / minorStep)) throw new Error("Invalid dial divisions");
  return Array.from({ length: max / minorStep + 1 }, (_, index) => {
    const value = index * minorStep;
    return { value, angle: angleFor(value), major: value % majorStep === 0, medium: value % (majorStep / 2) === 0 };
  });
}

export const speedAngle = (kph: number) => SPEED_START + kph / SPEED_MAX_KPH * SPEED_SWEEP;
// 160 mph is 257.49504 km/h. It stops just before 260 on the same physical needle.
export const MPH_TICKS = linearTicks(SPEED_MAX_MPH, 5, 20, value => speedAngle(value * MPH_TO_KPH));
export const KPH_TICKS = linearTicks(SPEED_MAX_KPH, 5, 20, speedAngle);

// Follow the left outer edge of the neighboring RPM circle, not the speed hub.
// Matches the 36% / 40% cluster layout and its 5% overlap.
export const SPEED_LAMP_POSITIONS = [205, 190, 175, 160].map(angle => ({
  x: 283 + 130 * Math.cos(angle * Math.PI / 180),
  y: 100 + 130 * Math.sin(angle * Math.PI / 180),
}));

export function arcPath(x: number, y: number, radius: number, start: number, end: number) {
  return `M ${x + radius * Math.cos(start)} ${y + radius * Math.sin(start)} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x + radius * Math.cos(end)} ${y + radius * Math.sin(end)}`;
}
