import {pieceById,type LayoutObject,type V3} from '../document/layoutDocument.ts';
import {kitAsset} from '../mapKit/catalog.ts';
import {worldSocket} from '../mapKit/sockets.ts';
import {railDamage} from './harborPieces.ts';

function prop(id:string,piece:string,at:V3,yaw=0):LayoutObject {
  const template=pieceById(piece)!;
  return {id,piece,name:template.label,position:at,yaw,size:[...template.size],color:template.color,
    locked:false,solid:template.solid!==false,parts:structuredClone(template.parts)};
}

function viaduct(objects:LayoutObject[]) {
  const segment=(id:string,key:string)=>prop('viaduct-'+id,'kit-'+key,[0,0,0]);
  const rise=segment('curve','highway_33_wide_bend45_rise10');
  const level=segment('span','highway_25_wide_straight_level');
  const descent=segment('descent','highway_28_wide_straight_rise10');
  const shape=(o:LayoutObject)=>kitAsset(o.piece)!;
  const mouth=(o:LayoutObject,i:number)=>worldSocket(o,shape(o),shape(o).sockets[i]);
  rise.yaw=90-mouth(rise,1).heading;
  rise.position=[-148,.09,42]; // Ground-level inlet on the western avenue.
  function join(previous:LayoutObject, next:LayoutObject, input:number){
    const from=mouth(previous,1),to=mouth(next,input);
    next.yaw=from.heading-to.heading+(input===1 ? 180 : 0);
    const local=mouth(next,input);
    next.position=from.position.map((v,i)=>v-local.position[i]) as V3;
  }
  join(rise,level,0);join(level,descent,1);
  objects.push(rise,level,descent);
  for(const [i,along] of [0,.5,1].entries()){
    const a=mouth(level,0).position,b=mouth(level,1).position;
    const x=a[0]+(b[0]-a[0])*along,z=a[2]+(b[2]-a[2])*along;
    const bottom=Math.abs(x)<24 ? -24 : 0;
    for(const side of [-1,1]){
      const column=prop('viaduct-column-'+i+'-'+side,'wall',[x,bottom,z+side*4.2]);
      column.size=[1.3,a[1]-bottom-.55,1.3];column.name='Viaduct support';objects.push(column);
    }
    const cap=prop('viaduct-cap-'+i,'floor',[x,a[1]-.8,z]);
    cap.size=[1.7,.48,10];cap.name='Viaduct crossbeam';objects.push(cap);
  }
  // Connect the road end to the eastern avenue across the short verge.
  const end=mouth(descent,0).position;
  const apron=prop('viaduct-east-apron','floor',[end[0],.01,end[2]]);
  apron.size=[16,.08,14];apron.color='#42484b';objects.push(apron);
}

export function dressHarbor(objects:LayoutObject[]){
  viaduct(objects);
  for(const side of [-1,1]){
    const bank=side<0?'west':'east';
    const place=(suffix:string,piece:string,x:number,z:number,yaw=0)=>{
      const o=prop('street-'+bank+'-'+suffix,piece,[side*x,.09,z],yaw);objects.push(o);return o;
    };
    // Keep the quayside vehicle lane and the glass-run approach open.
    for(const [i,z] of [-215,79,251].entries()){
      place('cart-'+i,'harbor-cart',73,z,side*90);
      place('paper-'+i,'harbor-news',73,z+3);
      place('table-'+i,'harbor-table',70,z+1);
      place('chair-a-'+i,'harbor-chair',69,z,90);place('chair-b-'+i,'harbor-chair',71,z+2,-90);
      place('bin-'+i,'harbor-bin',75,z+5);
      place('alley-'+i,'harbor-bags',98,z+5);
    }
    for(const [i,z] of [-236,-100,-60,55,100,208,270].entries())place('lamp-'+i,'harbor-lamp',64,z,side*90);
    // Close just one lane of the cross street; the other half carries the detour.
    place('closure-sign','harbor-closed',104,234,side*90);
    place('lane-sign','harbor-lane',113,234,side*90);
    for(let i=0;i<3;i++){
      const stop=place('barrier-'+i,'downtown-metal-barrier',104+i*1.8,234+i*.48,side*12);
      stop.destruction={...railDamage};
      place('cone-'+i,'downtown-cone',116+i*1.6,234+i*.45);
    }
    // A full closure on the other cross street leaves the parallel avenues
    // and the permanent causeway available. Each frame can break separately.
    place('roadworks','harbor-closed',108,-236,side*90);
    for(let i=0;i<4;i++){
      const fence=place('closed-'+i,'downtown-metal-barrier',104,-239+i*2,90);
      fence.destruction={...railDamage};
    }
    place('lever','bridge-lever',33,10,side*90);
  }
}
