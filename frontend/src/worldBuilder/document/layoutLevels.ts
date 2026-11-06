/** Construction planes use four metres per story, up to a 512 m tower. */
export const CONSTRUCTION_FLOOR_HEIGHT = 4;
export const MAX_CONSTRUCTION_FLOOR = 128;
export type LayoutLevel = "sea" | "ground" | `floor${number}`;
export const LAYOUT_LEVELS: {id:LayoutLevel;label:string;elevation:number}[] = [
  { id: "sea", label: "SEA", elevation: -8 },
  { id: "ground", label: "GROUND", elevation: 0 },
  ...Array.from({length:MAX_CONSTRUCTION_FLOOR},(_,index)=>{
    const floor=index+1;
    return {id:`floor${floor}` as LayoutLevel,
      label:floor===5?"FLOOR 5 · HIGH BRIDGE":`FLOOR ${floor}`,
      elevation:floor*CONSTRUCTION_FLOOR_HEIGHT};
  }),
];

export function layoutLevel(id: LayoutLevel) {
  return LAYOUT_LEVELS.find(level=>level.id===id)??LAYOUT_LEVELS[1];
}
