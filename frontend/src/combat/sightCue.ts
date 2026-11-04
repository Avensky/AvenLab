import {create} from 'zustand';
type SightCue='attack'|'ally'|'heal';
export const useSightCue=create<{id:string|null;tone:SightCue|null}>(()=>({id:null,tone:null}));

/** The existing visibility ray owns this cue too. Crossing a wall clears both the frame and reticle. */
export function publishSightCue(id:string,tone:SightCue|null){
 const current=useSightCue.getState();
 if(tone===null){
  if(current.id===id)useSightCue.setState({id:null,tone:null});
 }else if(current.id!==id||current.tone!==tone)useSightCue.setState({id,tone});
}
