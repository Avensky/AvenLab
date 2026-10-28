export const degrees = (radians: number) => radians * 180 / Math.PI;
export function arcPath(x: number, y: number, radius: number, start: number, end: number) {
  return `M ${x + radius * Math.cos(start)} ${y + radius * Math.sin(start)} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x + radius * Math.cos(end)} ${y + radius * Math.sin(end)}`;
}
