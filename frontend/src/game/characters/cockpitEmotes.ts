export const COCKPIT_TAKES = [
  { id: "068", name: "Take the wheel", duration: 4.25 },
  { id: "069", name: "Roll out and brake", duration: 6.5 },
  { id: "070", name: "Reverse park", duration: 6.2 },
  { id: "076", name: "Smooth overtake", duration: 5.8 },
  { id: "077", name: "Race face", duration: 5.1 },
  { id: "086", name: "Check the mirrors", duration: 3.8 },
  { id: "101", name: "Window wave", duration: 5.7 },
  { id: "102", name: "Driver thumbs-up", duration: 5.6 },
  { id: "199", name: "Steering test · Left", duration: 3.65 },
  { id: "200", name: "Steering test · Right", duration: 3.65 },
] as const;
export type CockpitTake = typeof COCKPIT_TAKES[number];
