// Packet spacing includes WAN and server scheduling jitter. Sample once for the
// whole world. A small reserve masks ordinary late arrivals without predicting cars.
export class PresentationDelay {
  private gaps:number[]=[];
  private cursor=0;
  private received:number|null=null;
  private frame:number|null=null;
  private target=50;
  private delay=50;

  reset(){this.gaps=[];this.cursor=0;this.received=null;this.frame=null;this.target=this.delay=50;}
  receipt(now:number){
    const dt=this.received===null?0:now-this.received;
    if(dt>250 || dt<0)this.reset();
    this.received=now;
    if(dt<=0 || dt>250)return;
    this.gaps[this.cursor%32]=dt;
    if(++this.cursor%8!==0)return;
    const sorted=this.gaps.slice().sort((a,b)=>a-b);
    this.target=Math.max(40,Math.min(90,sorted[Math.ceil(sorted.length*.95)-1]+8));
  }
  sample(now:number){
    const dt=this.frame===null?0:Math.max(0,Math.min(100,now-this.frame));this.frame=now;
    // Slower than the render clock, so increasing the reserve never reverses time.
    this.delay+=Math.max(-dt*.03,Math.min(dt*.12,this.target-this.delay));
    return this.delay;
  }
}
