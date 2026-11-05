import data from './wallPanels.json' with {type:'json'};

// Floor-sized openings measured in the 512 px source city. Coordinates are in
// chunk metres. Each lot retains its own opaque brick or concrete material.
export const wallPanels: Record<string, Record<string, number[][]>> = data;
export function panelGeometry(panels: number[][]) {
  const position:number[]=[], normal:number[]=[], uv:number[]=[], index:number[]=[];
  for (const [axis,side,plane,u0,u1,y0,y1] of panels) {
    const base=position.length/3;
    for(const [u,y] of [[u0,y0],[u1,y0],[u1,y1],[u0,y1]]) {
      position.push(...(axis===0 ? [plane,y,u] : [u,y,plane]));
      normal.push(axis===0 ? side : 0,0,axis===2 ? side : 0);
      // One material repeat per four metres; use world UVs across floor seams.
      uv.push(u/4,y/4);
    }
    const reverse=(axis===0 ? -1 : 1)!==side;
    index.push(...(reverse ? [0,2,1,0,3,2] : [0,1,2,0,2,3]).map(i=>i+base));
  }
  return {position,normal,uv,index};
}
