import fs from 'node:fs';
import {coastalMap} from '../frontend/src/worldBuilder/generation/coastalMap.ts';
import {mapExport} from '../frontend/src/worldBuilder/document/mapDocument.ts';
const text=mapExport(coastalMap()),output=new URL('../avenlab-server/src/assets/blocks/coastal_district_colliders.json',import.meta.url);
if(process.argv.includes('--check')){if(fs.readFileSync(output,'utf8')!==text)throw Error('Coastal map is stale');}else fs.writeFileSync(output,text);
console.log('Coastal District: independent map, expanded chase land, explicit team spawns');
