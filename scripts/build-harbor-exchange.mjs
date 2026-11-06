import fs from 'node:fs';
import { harborExchange } from '../frontend/src/worldBuilder/generation/harborExchange.ts';
import { mapExport } from '../frontend/src/worldBuilder/document/mapDocument.ts';

const layout = harborExchange();
const source = {
  schema_version: 2, map_id: layout.map_id,
  coordinate_system: { units: 'meters', up_axis: 'y', forward_axis: '+z' },
  cell: [260, 280], surface: { road_y: 0 },
  layout: { kind: 'fixed_grid', origin: [0, 0], size: [1, 1] },
  visuals: [], roads: [], buildings: [], authored_layout: layout,
  metadata: { name: 'Harbor Exchange', description: 'Collision district · mountain road and canal tunnels, curved cutting, viaduct, underpass and waterfall terminus.' },
};
const text = mapExport(source);
const output = new URL('../avenlab-server/src/assets/blocks/harbor_exchange_colliders.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8') !== text) throw Error('Harbor Exchange fixture is stale');
} else fs.writeFileSync(output, text);
console.log(`Harbor Exchange: ${layout.objects.length} editable pieces, ${layout.objects.reduce((n, o) => n + o.parts.length, 0)} shapes; finite, no support ground`);
