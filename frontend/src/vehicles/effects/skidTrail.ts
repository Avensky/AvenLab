export type V3=[number,number,number];
export type Contact=[number,number,number,number,number,number,number];
export type TrailPoint={position:V3;normal:V3;intensity:number;time:number};
export type TrailSegment={from:V3;to:V3;normal:V3;intensity:number;time:number};
export type TrailSampling={minIntensity:number;minDistance:number};
/** No segment may bridge a lost contact, teleport or stale packet. */
export class SkidTrail {
 private last:TrailPoint|null=null;
 reset(){this.last=null;}
 sample(contact:Contact|null|undefined,grounded:boolean,time:number,sampling:TrailSampling={minIntensity:.08,minDistance:.12}):TrailSegment|null{
  if(!grounded||!contact||contact.length!==7||!contact.every(Number.isFinite)||contact[6]<sampling.minIntensity||contact[4]<.35){this.reset();return null;}
  const n=Math.hypot(contact[3],contact[4],contact[5]);if(n<.9||n>1.1){this.reset();return null;}
  const next:TrailPoint={position:contact.slice(0,3) as V3,normal:contact.slice(3,6).map(v=>v/n) as V3,intensity:Math.min(1,contact[6]),time};
  const old=this.last;
  if(!old){this.last=next;return null;}
  const distance=Math.hypot(...next.position.map((v,i)=>v-old.position[i]));
  if(time<=old.time||time-old.time>.25||distance>3||next.normal.reduce((sum,v,i)=>sum+v*old.normal[i],0)<.9){this.last=next;return null;}
  if(distance<sampling.minDistance)return null;
  this.last=next;return {from:old.position,to:next.position,normal:next.normal,intensity:(old.intensity+next.intensity)/2,time};
 }
}
