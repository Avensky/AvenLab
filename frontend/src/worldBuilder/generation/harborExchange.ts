import { emptyLayout, parseLayout, type V3, type WorldLayout } from '../document/layoutDocument.ts';
import { colliderBox, excavateRoute, presetPath, type RouteOptions } from './excavation.ts';
import { guardrailRun } from './harborPieces.ts';

export const HARBOR_EXCHANGE_ID = 'harbor_exchange';
/** A compact collision district, drivable without any decorative asset pack. */
export function harborExchange(): WorldLayout {
  let doc: WorldLayout = { ...emptyLayout(HARBOR_EXCHANGE_ID), title: 'Harbor Exchange', base: 'replace', ground: false, repeat: false,
    spawns: [
      { id: 'spawn-red-1', team: 'red', position: [-66, 1, -98], yaw: 0 },
      { id: 'spawn-blue-1', team: 'blue', position: [62, 1, -98], yaw: 0 },
    ], objects: [] };
  for (const side of [-1, 1]) doc.objects.push(colliderBox(`quay-${side < 0 ? 'west' : 'east'}`, 'exchange-quay', [side * 60, -10, 0], [88, 10, 240], '#6b7069'));
  const hill = colliderBox('exchange-mountain', 'mountain-exchange', [-56, 0, 28], [96, 36, 112], '#69736a');
  hill.parts = [
    { shape: 'box', position: [0, .15, 0], size: [1, .3, 1] },
    { shape: 'box', position: [0, .45, 0], size: [.8, .3, .85] },
    { shape: 'box', position: [0, .8, 0], size: [.5, .4, .6] },
  ];
  doc.objects.push(hill, colliderBox('canal-mountain', 'mountain-exchange', [0, -10, 64], [64, 42, 72], '#69736a'));
  const route = (kind: RouteOptions['kind'], points: V3[], width = 12, extra: Partial<RouteOptions> = {}) => {
    doc = excavateRoute(doc, { kind, points, width, height: 7, depth: 6, resolution: 2, rails: true, waterfall: false, ...extra }).doc;
  };
  route('tunnel', [[-66, 0, -104], [-66, 0, -12]], 12);
  // Leave an actual junction opening in both the mountain and tunnel lining.
  route('road', [[-66, 0, -12], [-66, 0, 12]], 12, { rails: false });
  route('tunnel', [[-66, 0, 12], [-66, 0, 100]], 12);
  route('road', presetPath(84, -90, [-12, 0, -52]), 10, { rails: false });
  // Water surface -2, bed -8; an enclosed passage through the second mountain.
  route('canal', [[0, -2, -108], [0, -2, 20]], 24);
  route('canal-tunnel', [[0, -2, 20], [0, -2, 102]], 24, { height: 10 });
  route('canal', [[0, -2, 102], [0, -2, 114]], 24, { waterfall: true, height: 16 });
  // Bridge underside +9.5 leaves 11.5 metres above the water. Piers avoid the channel.
  route('road', [[-84, 10, -36], [84, 10, -36]], 12, { rails: false });
  const bridge = doc.objects.find(o => o.piece === 'excavated-road' && o.position[1] === 9.5)!;
  const rampEnd = bridge.position[2] - bridge.size[0] / 2;
  // Leave real openings at the ramp mouths; rails must not cross the approaches.
  for (const side of [-1, 1]) doc.objects.push(...guardrailRun(`viaduct-rail-${side < 0 ? 'south' : 'north'}`, -76, -36 + side * (bridge.size[0] / 2 - .3), 76, -36 + side * (bridge.size[0] / 2 - .3), 10));
  for (const x of [-80, -28, 28, 80]) doc.objects.push(colliderBox(`viaduct-pier-${x < 0 ? 'w' : 'e'}-${Math.abs(x)}`, 'highway-support-pier', [x, 0, -36], [2, 9.5, 4], '#858b8c'));
  // Sheared slabs preserve real space under each graded approach.
  for (const side of [-1, 1]) {
    const ramp = colliderBox(`viaduct-ramp-${side < 0 ? 'west' : 'east'}`, 'exchange-ramp', [side * 84, 4.5, (-96 + rampEnd) / 2], [96 + rampEnd, 5, 12], '#414b54', -90);
    ramp.parts[0] = { shape: 'box', position: [0, .05, 0], size: [1, .1, 1], rise: 2 };
    doc.objects.push(ramp);
  }
  route('underpass', [[62, 0, -104], [62, 0, 100]], 12);
  doc.objects.push(colliderBox('lookout-deck', 'waterfall-lookout-boardwalk', [28, -.4, 106], [24, .4, 12], '#8d7960'));
  return parseLayout(doc);
}
