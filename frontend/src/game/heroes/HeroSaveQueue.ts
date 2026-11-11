import type { HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
export type HeroSaveJob = {hero:string;vehicle:string;appearance:HeroAppearance;makeDefault:boolean};
export type HeroSaveStatus = "idle"|"pending"|"saving"|"saved"|"error";
/** Serialize profile writes, coalescing rapid edits per vehicle. A newer main
 * choice supersedes queued older choices; style edits never choose a main. */
export class HeroSaveQueue<Result = void> {
 private jobs=new Map<string,HeroSaveJob>();
 private timer:ReturnType<typeof setTimeout>|undefined;
 private running:Promise<boolean>|null=null;
 private send:(job:HeroSaveJob)=>Promise<Result>;
 private ack:(job:HeroSaveJob,result:Result)=>void;
 private status:(state:HeroSaveStatus,message?:string)=>void;
 private delay:number;
 constructor(send:(job:HeroSaveJob)=>Promise<Result>,ack:(job:HeroSaveJob,result:Result)=>void,status:(state:HeroSaveStatus,message?:string)=>void,delay=300){this.send=send;this.ack=ack;this.status=status;this.delay=delay;}
 enqueue(job:HeroSaveJob){
  if(job.makeDefault)for(const pending of this.jobs.values())pending.makeDefault=false;
  const previous=this.jobs.get(job.vehicle);
  this.jobs.delete(job.vehicle);
  this.jobs.set(job.vehicle,{...job,appearance:{...job.appearance},makeDefault:job.makeDefault||Boolean(previous?.makeDefault)});
  this.status("pending");clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),this.delay);
 }
 resume(){if(this.jobs.size)void this.flush();}
 flush():Promise<boolean>{
  clearTimeout(this.timer);
  if(this.running)return this.running;
  this.running=this.drain().finally(()=>{this.running=null;});return this.running;
 }
 private async drain(){
  while(this.jobs.size){
   const [key,job]=this.jobs.entries().next().value!;this.jobs.delete(key);this.status("saving");
   try{const result=await this.send(job);this.ack(job,result);}catch(e){if([...this.jobs.values()].some(p=>p.makeDefault))job.makeDefault=false;if(!this.jobs.has(key))this.jobs.set(key,job);this.status("error",e instanceof Error?e.message:"Unable to save your style.");return false;}
  }
  this.status("saved");return true;
 }
 dispose(){clearTimeout(this.timer);this.jobs.clear();}
}
