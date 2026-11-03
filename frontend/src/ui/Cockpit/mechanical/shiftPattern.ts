export type ShiftSlot={gear:number;label:string;x:number;y:number};
/** Six is the protocol maximum; only advertised forward gears are drawn. */
export function manualShiftPattern(count:number):ShiftSlot[]{
  const gears=Math.max(1,Math.min(6,Math.floor(Number.isFinite(count)?count:6)));
  const columns=Math.ceil(gears/2);
  const x=(column:number)=>columns===1?61:36+column*50/(columns-1);
  return [
    {gear:7,label:'R',x:12,y:25},
    ...Array.from({length:gears},(_,i)=>({gear:i+1,label:String(i+1),x:x(Math.floor(i/2)),y:i%2===0?25:78})),
    {gear:0,label:'N',x:x(Math.floor((columns-1)/2)),y:51},
  ];
}
export function manualShiftGate(slots:ShiftSlot[]){
  const columns=[...new Set(slots.filter(s=>s.gear>0&&s.gear<7).map(s=>s.x))];
  return `M12 25V51H${Math.max(...columns)}${columns.map(x=>`M${x} 25V${slots.some(s=>s.x===x&&s.y===78)?78:51}`).join('')}`;
}
