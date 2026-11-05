import type {LayoutObject} from '../document/layoutDocument.ts';

// Measured from the water datum to the top of the seabed, in metres.
export const DOCK_DEPTH = 52;

export function coastalTerrain(objects: LayoutObject[]) {
  const waters = objects.filter(o => o.piece === 'coastal-water-visual');
  if (!waters.length) return;
  const beds = objects.filter(o => o.piece === 'harbor-seabed');
  const floor = Math.min(...waters.map(o => o.position[1] - DOCK_DEPTH),
    ...beds.map(o => o.position[1] + o.size[1]));

  for (const item of objects) {
    const shore = item.piece === 'coastal-land' || item.piece === 'coastal-land-bridge';
    const pile = item.piece === 'harbor-column' && item.id.startsWith('col-');
    if ((!shore && !pile) || item.position[1] <= floor) continue;
    const top = item.position[1] + item.size[1];
    item.position[1] = floor;
    item.size[1] = top - floor;
  }
  const byId = new Map(objects.map(o => [o.id, o]));
  for (const water of waters) {
    const id = 'bed-' + water.id;
    const old = byId.get(id);
    if (old) {
      if (old.piece === 'harbor-seabed') old.position[1] = floor - old.size[1];
      continue;
    }
    const [x, , z] = water.position;
    objects.push({id, piece: 'harbor-seabed', name: 'Seafloor', position: [x, floor - 1, z],
      yaw: water.yaw, size: [water.size[0], 1, water.size[2]], color: '#515354', solid: true, locked: false,
      parts: [{shape: 'box', position: [0, .5, 0], size: [1, 1, 1]}]});
  }
}
