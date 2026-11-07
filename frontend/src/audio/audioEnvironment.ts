import type {MapSnapshot} from '../store/world/worldStore';
import type {AudioPoint} from './vehicleSoundModel.ts';

type Zone={x:number;z:number;halfX:number;halfZ:number;low:number;high:number;sin:number;cos:number};
const cache=new WeakMap<MapSnapshot,Zone[]>();

/** Cheap authored-volume acoustics, not ray-traced sound. Built once per map,
 * then at most 128 box checks per 20 Hz audio tick; never queries the renderer. */
export function tunnelReverbAt(map:MapSnapshot|null,point:AudioPoint):number {
  if(!map?.authored_layout)return 0;
  let zones=cache.get(map);
  if(!zones){
    zones=[];
    const objects=map.authored_layout.objects,byId=new Map(objects.map(o=>[o.id,o]));
    const origin=map.layout.kind==='fixed_grid'?map.layout.origin:[0,0];
    const offsetX=origin[0]*map.cell[0],offsetZ=origin[1]*map.cell[1];
    for(const item of objects){
      if(zones.length>=128)break;
      const shell=item.piece==='urban-tunnel-shell',roof=item.piece==='excavated-tunnel-roof';
      if(!shell&&!roof)continue;
      const floor=roof?byId.get(item.id.replace(/-roof$/,'-floor')):undefined;
      const low=shell?item.position[1]:floor?floor.position[1]+floor.size[1]:item.position[1]-12;
      const high=shell?item.position[1]+item.size[1]*.88:item.position[1];
      const yaw=item.yaw*Math.PI/180;
      zones.push({x:offsetX+item.position[0],z:offsetZ+item.position[2],halfX:item.size[0]/2,halfZ:item.size[2]/2,
        low:low-.8,high:high+.2,sin:Math.sin(yaw),cos:Math.cos(yaw)});
    }
    cache.set(map,zones);
  }
  for(const zone of zones){
    if(point[1]<zone.low||point[1]>zone.high)continue;
    const dx=point[0]-zone.x,dz=point[2]-zone.z;
    if(Math.abs(zone.cos*dx-zone.sin*dz)<=zone.halfX&&Math.abs(zone.sin*dx+zone.cos*dz)<=zone.halfZ)return 1;
  }
  return 0;
}
