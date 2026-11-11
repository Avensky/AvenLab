import { openCharacterEditor } from "../characterEditor/characterEditorStore";
import { useConnectionView } from "../../store/session/networkViews";
import {useState} from 'react';
import {useLayoutStore} from '../state/layoutStore';
import {useSocialStore} from '../../store/social/socialStore';

import {useInputStore} from '../../store/input/inputStore';
import {useUIStore} from '../../store/menus/uiStore';
import {useBuilderStore} from '../state/builderStore';
import {useVehicleEditorStore} from './vehicleEditorStore';
import './vehicleEditor.css';
/** The live world's HUD owns these tools; tuning stays restricted to editor worlds. */
export function EditorDriveBar(){
 const active=useSocialStore(s=>s.view?.alpha?.active),connected=useConnectionView(s => s.connected);
 const [open,setOpen]=useState(false);
 if(!['editor', 'sandbox'].includes(active?.mode ?? '')||!connected)return null;
 const show=(workspace:'layout'|'vehicle',presentation:'workspace'|'hud')=>{
  useInputStore.getState().releaseControls();
  useVehicleEditorStore.getState().setView('chase');
  useBuilderStore.setState({workspace,presentation});
  if(presentation==='hud')useLayoutStore.setState({view:'3d'});
  useUIStore.getState().setOverlay('world_builder');setOpen(false);
 };
 return <section className="world-edit-tools" aria-label="World editor HUD tools">
  <button onClick={openCharacterEditor}>EDIT CHARACTER</button>
  {active?.mode === 'editor' && <><button onClick={()=>show('vehicle','workspace')}>EDIT VEHICLE</button>
  <button aria-label="World tools" aria-expanded={open} onClick={()=>setOpen(!open)}>WORLD ▾</button>
  {open&&<div className="world-edit-tool-menu"><button onClick={()=>show('layout','workspace')}>WORLD EDITOR</button><button onClick={()=>show('layout','hud')}>BUILD IN WORLD</button></div>}
 </>}
 </section>;
}
