export function cooldownProgress(remaining:number|undefined,duration:number){
  return remaining===undefined||!Number.isFinite(remaining)||!(duration>0)?null:Math.max(0,Math.min(1,1-remaining/duration));
}
