import {useGameStore} from './gameStore';
import {useWorldStore,type RenderMode} from './worldStore';
import {useInputStore} from './inputStore';
import {useUIStore} from './uiStore';
import {DebugFlags as D} from './tools/debugMasks';
import {useDebugViewStore,type DebugPlayerScope} from './debugViewStore';
let prior:{mask:number;enabled:boolean;mode:RenderMode;scope:DebugPlayerScope}|null=null;
let stopScreenWatch:(()=>void)|null=null;
export function enterInspection(preset:'suspension'|'collider'|'handling'='suspension'){
 const world=useWorldStore.getState(),view=useDebugViewStore.getState();
 if(!useGameStore.getState().editor)prior={mask:world.debugMask,enabled:world.debugEnabled,mode:world.mode,scope:view.playerScope};
 useInputStore.getState().releaseControls();useGameStore.getState().setEditor(true);useUIStore.getState().closeOverlay();view.setPlayerScope('local');world.setDebugEnabled(true);world.setMode('hybrid');world.setDebugMask(D.CHASSIS|D.WHEELS|(preset==='suspension'?D.RAYS|D.LOAD_BARS|D.ARB:preset==='handling'?D.SLIP:0));
 if(!stopScreenWatch)stopScreenWatch=useUIStore.subscribe(state=>{if(state.screen!=='sandbox')leaveInspection();});
}
export function leaveInspection(){
 stopScreenWatch?.();stopScreenWatch=null;
 useGameStore.getState().setEditor(false);if(prior){const w=useWorldStore.getState();w.setDebugMask(prior.mask);w.setDebugEnabled(prior.enabled);w.setMode(prior.mode);useDebugViewStore.getState().setPlayerScope(prior.scope);prior=null;}
}
