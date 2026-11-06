import data from "./carrierDeck.json" with {type:"json"};
import type {Piece, LayoutPart, V3} from "../document/layoutDocument.ts";
import {burkeSize,burkeCollisionParts,burkeKeelY} from "./burkeDeck.ts";

export const CARRIER = "big-e-docked";
export const DESTROYER="arleigh-burke-docked";
export const LIFT = "canal-lift";
// Small enough that a car breaks one panel, rather than removing a whole road edge.
export const GUARDRAIL_MODULE_METERS = 3.6;
export const railDamage={enabled:true,hp:5,smallArms:1,cannon:1,bomb:1,rubble:"clear" as const};
export const carrierSize = data.size as V3;
export const harborPieces: Piece[] = [{
  id:CARRIER, label:"Big E · docked flight deck", category:"props",
  description:"Level CVN-65 deck. Place the origin at flight-deck height.",
  size:carrierSize, color:"#677882", parts:data.parts as LayoutPart[],
}, {
  id:"highway-guardrail", label:"Highway guardrail", category:"roads",
  description:"Independent 3.6 m impact panel. Road deck and edge protection resize separately.",
  size:[GUARDRAIL_MODULE_METERS,1.05,.4], color:"#9da9aa",
  parts:[{shape:"box",position:[0,.68,0],size:[1,.37,.56]},
    ...[-.46,0,.46].map(x=>({shape:"box" as const,position:[x,.4,.19] as V3,size:[.035,.8,.55] as V3,solid:false}))],
}, {
  id:'bridge-lever',label:'Bridge lever',category:'props',description:'Operate the canal drawbridge from the switch stand.',
  size:[.72,1.5,.7],color:'#c59346',parts:[
    {shape:'box',position:[0,.36,0],size:[.64,.72,.70],color:'#545e64'},
    {shape:'box',position:[0,.82,0],size:[.12,.36,.12],color:'#c59346'},
    {shape:'box',position:[0,.96,0],size:[.58,.12,.21],color:'#d34c3f'},
  ],
}, {
  id:DESTROYER,label:"Arleigh Burke · escort destroyer",category:"props",
  description:"154 m destroyer · static harbor prototype with walkable deck, bridge and hull collision. Buoyancy and weapons come later.",
  size:burkeSize,color:"#52626b",parts:burkeCollisionParts,
}];

export function guardrail(id:string,x1:number,z1:number,x2:number,z2:number,surface:number, rise=0):import("../document/layoutDocument.ts").LayoutObject{
  const dx=x2-x1,dz=z2-z1,template=harborPieces[1];
  if(Math.hypot(dx,dz)>GUARDRAIL_MODULE_METERS+.001)
    throw Error(`Guardrail ${id} exceeds one vehicle-length module; use guardrailRun()`);
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

/** Independent impact pieces along a level or graded rail. The requested
 * surface is the midpoint height; rise is the total end-to-end grade.
 */
export function guardrailRun(id:string,x1:number,z1:number,x2:number,z2:number,surface:number,rise=0){
  const count=Math.max(1,Math.ceil(Math.hypot(x2-x1,z2-z1)/GUARDRAIL_MODULE_METERS));
  return Array.from({length:count},(_,i)=>{
    const a=i/count,b=(i+1)/count;
    return guardrail(`${id}-${i+1}`,x1+(x2-x1)*a,z1+(z2-z1)*a,
      x1+(x2-x1)*b,z1+(z2-z1)*b,surface+rise*((a+b)/2-.5),rise/count);
  });
}

// Recompute the eye from the placed hull, so rotated and resized prefabs keep a
// viewpoint above the deck. Look toward the nearest bank (city center fallback).
export function deckPanorama(item:import("../document/layoutDocument.ts").LayoutObject,
    objects:import("../document/layoutDocument.ts").LayoutObject[]){
  const [x,y,z]=item.position, yaw=item.yaw*Math.PI/180;
  const destroyer=item.piece===DESTROYER;
  const fore=item.size[2]*(destroyer ? .38 : -.28);
  const deckEye=destroyer?(-2.85-burkeKeelY)*item.size[1]/burkeSize[1]+3.5:Math.max(5,item.size[1]*.13);
  const eye:V3=[x+fore*Math.sin(yaw),y+deckEye,z+fore*Math.cos(yaw)];
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
