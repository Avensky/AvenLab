import { kitAsset } from "../../worldBuilder/mapKit/catalog";
import { worldSocket } from "../../worldBuilder/mapKit/sockets";
import {memo,useMemo} from "react";
import {useWorldStore} from "../../store/world/worldStore";
import type {WorldLayout} from "../../worldBuilder/document/layoutDocument";
import type {DebugAabbBox} from "../../store/session/networkStore";

export const isHarbor=(id?:string)=>/^harbor_canal_(red|blue|fleet)$/.test(id??"");
export function charted(bits:string,x:number,z:number){
  const col=Math.floor((x+400)/100),row=Math.floor((z+400)/100);
  if(col<0||col>=8||row<0||row>=8)return false;
  const i=row*8+col;
  return Boolean(parseInt(bits[15-(i>>2)]??"0",16)&(1<<(i%4)));
}
export function harborRoads(layout:WorldLayout,collapsed:boolean):DebugAabbBox[]{
  return layout.objects.flatMap((o):DebugAabbBox[]=>{
    const asset=kitAsset(o.piece);
    if (asset?.sockets.length===2) {
      const mouths=asset.sockets.map(s=>worldSocket(o,asset,s));
      const edges=mouths.flatMap(({position:[x,,z],heading,width})=>{
        const a=heading*Math.PI/180,dx=Math.cos(a)*width/2,dz=-Math.sin(a)*width/2;
        return [[x-dx,z-dz],[x+dx,z+dz]];
      });
      const xs=edges.map(p=>p[0]),zs=edges.map(p=>p[1]);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
      return [{kind:"road",id:o.id,visual:o.name,center:[(minX+maxX)/2,o.position[1],(minZ+maxZ)/2],
        half_extents:[(maxX-minX)/2,.1,(maxZ-minZ)/2]}];
    }
    if (o.piece!=="coastal-road" && o.name!=="Permanent causeway" &&
        !(o.piece==="canal-breakable"&&!collapsed) && o.piece!=="canal-lift") return [];
    return [{kind:"road",id:o.id,visual:o.name,
      center:[o.position[0]+(o.piece==="canal-lift"?(o.yaw===0?12:-12):0),o.position[1],o.position[2]],
      half_extents:[o.size[0]/2,o.size[1]/2,o.size[2]/2]}];
  });
}
export const HarborChart=memo(function HarborChart({layout,range}:{layout:WorldLayout,range:number}){
  const bits=useWorldStore(s=>s.sectorChart);
  const fog=useMemo(()=>{
    let path="";
    for(let row=0;row<8;row++)for(let col=0;col<8;col++){
      const x=col*100-400,z=row*100-400;
      if(!charted(bits,x,z))path+=`M${x} ${z}h100v100h-100Z`;
    }
    return path;
  },[bits]);
  const sites=useMemo(()=>layout.objects.filter(o=>["fuel-station","repair-shop","service-center"].includes(o.piece)&&
    charted(bits,o.position[0],o.position[2])),[layout,bits]);
  return <g pointerEvents="none">
    <path d={fog} fill="#070e15" opacity=".86" aria-label="Unsurveyed sectors"/>
    {sites.map(o=><g key={o.id} transform={`translate(${o.position[0]} ${o.position[2]}) scale(${range/115})`} aria-label={o.name}>
      <title>{o.name}</title><rect x="-2.5" y="-2.5" width="5" height="5" rx=".6" fill="#111a20" stroke="var(--app-accent)" strokeWidth=".35"/>
      <text textAnchor="middle" y="1.25" fill="#e5eded" fontSize="3.5" fontWeight="bold">{o.piece==="fuel-station"?"F":o.piece==="repair-shop"?"R":"+"}</text>
    </g>)}
  </g>;
});
