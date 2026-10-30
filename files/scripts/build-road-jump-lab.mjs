import fs from 'node:fs';
import {addPiece,emptyLayout,updatePiece} from '../frontend/src/worldBuilder/document/layoutDocument.ts';
import {roadAsset} from '../frontend/src/worldBuilder/roads/roadCatalog.ts';
import {opposingRoadPair} from '../frontend/src/worldBuilder/roads/roadPair.ts';
import {mapExport} from '../frontend/src/worldBuilder/document/mapDocument.ts';

// Source asphalt bounds are the seam authority. Never resize imported roads.
export function roadJumpLab(source) {
 let layout=emptyLayout('road_jump_lab');
 const put=(piece,id,position,size,yaw=0)=>{
  layout=addPiece(layout,piece,position,yaw);
  const item=layout.objects.at(-1);
  layout=updatePiece(layout,item.id,{name:id,...(size?{size}:{})});
  layout.objects.at(-1).id=id;
 };
 const narrow=roadAsset('road_narrow'),wide=roadAsset('road_wide'),junction=roadAsset('intersection');
 const length=narrow.surface.max[2]-narrow.surface.min[2],center=-narrow.surface.min[2];
 put('glb-road_narrow','jump-approach',[0,0,center],undefined,180);
 const approach=layout.objects.at(-1);
 layout=updatePiece(layout,approach.id,{road:{...approach.road,variant:{...approach.road.variant,left:false}}});
 put('glb-road_narrow','end-to-end-road',[0,0,center+length]);
 put('ramp','launch-ramp',[0,0,-8],[8,4,16]);
 // Open air from Z=-16 to -24. No floor, terrain or assist collider below it.
 put('floor','landing-roof',[0,1.6,-64],[40,.4,80]);
 put('building','height-limit',[50,0,-64],[16,24,24]);
 // Optional jump; a separate ground lane remains useful after a miss.
 put('floor','bypass-entry',[20,-.4,30],[40,.4,20]);
 put('floor','ground-bypass',[30,-.4,-42],[20,.4,164]);
 put('floor','return-cross-lane',[10,-.4,-124],[60,.4,8]);
 put('ramp','roof-return-ramp',[16,0,-112],[8,2,16],180);
 put('barrier','launch-left',[-5,0,-8],[.6,1,16]);
 put('barrier','launch-right',[5,0,-8],[.6,1,16]);
 put('glb-road_narrow','opposing-source',[-160,0,center]);
 layout=opposingRoadPair(layout,'opposing-source');
 layout.objects.at(-1).id='opposing-return';
 put('glb-road_wide','wide-station',[160,0,center]);
 // Align asphalt ends, retaining original asymmetric sidewalk overhangs.
 put('glb-intersection','junction-station',[160,0,center+wide.surface.min[2]-junction.surface.max[2]]);
 layout={...layout,title:'Road & Jump Lab',base:'replace',ground:false,repeat:false};
 // Drop obsolete city geometry rather than leaving dormant records in exports.
 return JSON.parse(mapExport({...source,map_id:layout.map_id,roads:[],buildings:[],authored_layout:layout}));
}
const source=JSON.parse(fs.readFileSync(new URL('../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json',import.meta.url),'utf8'));
const text=JSON.stringify(roadJumpLab(source),null,2)+'\n';
const out=new URL('../avenlab-server/src/assets/blocks/road_jump_lab_colliders.json',import.meta.url);
if(process.argv.includes('--check')){if(fs.readFileSync(out,'utf8')!==text)throw Error('Road & Jump Lab fixture is stale');}
else fs.writeFileSync(out,text);
console.log('Road & Jump Lab: intact measured roads, 8 × 4 × 16 m launch, 8 m open gap, 2 m landing roof; finite, no hidden ground');
