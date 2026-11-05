import data from "./carrierDeck.json" with {type:"json"};
import type {Piece, LayoutPart, V3} from "../document/layoutDocument.ts";

export const CARRIER = "big-e-docked";
export const LIFT = "canal-lift";
export const railDamage={enabled:true,hp:5,smallArms:1,cannon:1,bomb:1,rubble:"clear" as const};
export const carrierSize = data.size as V3;
export const harborPieces: Piece[] = [{
  id:CARRIER, label:"Big E · docked flight deck", category:"props",
  description:"Level CVN-65 deck. Place the origin at flight-deck height.",
  size:carrierSize, color:"#677882", parts:data.parts as LayoutPart[],
}, {
  id:"highway-guardrail", label:"Highway guardrail", category:"roads",
  description:"Galvanized rail and posts. Adjacent segments can follow a curve.",
  size:[24,1.05,.4], color:"#9da9aa",
  parts:[{shape:"box",position:[0,.68,0],size:[1,.37,.56]},
    ...[-.46,-.30,-.15,0,.15,.30,.46].map(x=>({shape:"box" as const,position:[x,.4,.19] as V3,size:[.017,.8,.55] as V3,solid:false}))],
}, {
  id:'bridge-lever',label:'Bridge lever',category:'props',description:'Operate the canal drawbridge from the switch stand.',
  size:[.72,1.5,.7],color:'#c59346',parts:[
    {shape:'box',position:[0,.36,0],size:[.64,.72,.70],color:'#545e64'},
    {shape:'box',position:[0,.82,0],size:[.12,.36,.12],color:'#c59346'},
    {shape:'box',position:[0,.96,0],size:[.58,.12,.21],color:'#d34c3f'},
  ],
}];

export function guardrail(id:string,x1:number,z1:number,x2:number,z2:number,surface:number, rise=0):import("../document/layoutDocument.ts").LayoutObject{
  const dx=x2-x1,dz=z2-z1,template=harborPieces[1];
  const parts=structuredClone(template.parts);
  // Local +X points from endpoint 1 toward endpoint 2 on either bank.
  // Keep posts plumb and move their feet to the deck directly beneath them.
  if (rise) {
    for (const part of parts) {
      part.position[1] += part.position[0] * rise / template.size[1];
      if (part.solid !== false) part.rise = rise / template.size[1];
    }
  }
  return {id,name:template.label,piece:template.id,position:[(x1+x2)/2,surface,(z1+z2)/2],
    size:[Math.hypot(dx,dz),template.size[1],template.size[2]],yaw:-Math.atan2(dz,dx)*180/Math.PI,
    color:template.color,locked:false,solid:true,parts,destruction:{...railDamage}};
}

// Recompute the eye from the placed hull, so rotated and resized prefabs keep a
// viewpoint above the deck. Look toward the nearest bank (city center fallback).
export function deckPanorama(item:import("../document/layoutDocument.ts").LayoutObject,
    objects:import("../document/layoutDocument.ts").LayoutObject[]){
  const [x,y,z]=item.position, yaw=item.yaw*Math.PI/180;
  const fore=-item.size[2]*.28;
  const eye:V3=[x+fore*Math.sin(yaw),y+Math.max(5,item.size[1]*.13),z+fore*Math.cos(yaw)];
  let shore:V3=[0,y,0],nearest=Infinity;
  for(const o of objects){
    if(o.piece!=="coastal-land")continue;
    const distance=(o.position[0]-eye[0])**2+(o.position[2]-eye[2])**2;
    if(distance<nearest){shore=o.position;nearest=distance;}
  }
  let dx=shore[0]-eye[0],dz=shore[2]-eye[2];
  if(Math.hypot(dx,dz)<1){dx=Math.cos(yaw);dz=-Math.sin(yaw);}
  const distance=Math.hypot(dx,dz);
  const target:V3=[eye[0]+dx/distance*120,y+2,eye[2]+dz/distance*120];
  return {eye,target};
}
