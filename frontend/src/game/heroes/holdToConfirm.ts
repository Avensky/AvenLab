export const MAIN_HERO_HOLD_MS = 1200;
/** One intentional, uninterrupted hold. Competing input sources cannot finish
 * or cancel each other's gesture; completion is latched until context reset. */
export class HoldToConfirm {
 private source:string|null=null;
 private started=0;
 private complete=false;
 readonly duration:number;
 constructor(duration=MAIN_HERO_HOLD_MS){this.duration=duration;}
 begin(source:string,now:number){if(this.source||this.complete||!Number.isFinite(now))return false;this.source=source;this.started=now;return true;}
 sample(now:number){
  if(this.complete)return {progress:1,justCompleted:false};
  if(!this.source)return {progress:0,justCompleted:false};
  const progress=Math.max(0,Math.min(1,(now-this.started)/this.duration));
  if(progress>=1){this.complete=true;return {progress:1,justCompleted:true};}
  return {progress,justCompleted:false};
 }
 release(source:string){if(this.source!==source)return false;this.source=null;return true;}
 cancel(){this.source=null;this.complete=false;this.started=0;}
}
