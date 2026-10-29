import type {WorldLayout} from '../layoutDocument.ts';
import {degrees, duplicatePiece, parseLayout} from '../layoutDocument.ts';
import {localBounds} from './layoutSnapping.ts';
export function opposingRoadPair(doc: WorldLayout, id: string) {
  const item=doc.objects.find(o=>o.id===id);
  if(!item?.road || item.road.asset!=='road_narrow')throw Error('Choose a narrow one-way road');
  if(item.locked)throw Error('Unlock this road before creating a pair');
  const result=duplicatePiece(doc,id,1),a=result.objects.find(o=>o.id===id)!,b=result.objects.at(-1)!,bounds=localBounds(a,'asphalt'),width=bounds.max[0]-bounds.min[0],angle=a.yaw*Math.PI/180;
  a.road!.variant.right=false;b.road!.variant.right=false;
  a.road!.variant.flow='one-way-forward';b.road!.variant.flow='one-way-forward';
  b.position=[a.position[0]+Math.cos(angle)*width,a.position[1],a.position[2]-Math.sin(angle)*width];b.yaw=degrees(a.yaw+180);b.name='Opposing carriageway';
  return parseLayout(result);
}
