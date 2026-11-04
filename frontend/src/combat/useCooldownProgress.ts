import {useEffect,useState} from 'react';

/** Animate a utility's shared deadline locally, stopping when its refill ends. */
export function useCooldownProgress(readyAt:number,durationMs:number){
 const [now,setNow]=useState(()=>performance.now());
 useEffect(()=>{
  let frame=0;
  const tick=()=>{const time=performance.now();setNow(time);if(time<readyAt)frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[readyAt]);
 return Math.max(0,Math.min(1,1-(readyAt-now)/durationMs));
}
