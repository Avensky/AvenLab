import {memo,useCallback,useMemo,useRef,type PointerEvent} from 'react';
import {useBuilderStore} from './builderStore';
import {useControlRelease} from '../controls/useControlRelease';
import {colliderPath,editableBoxes,pickBox,planPoint,snapValue,type MapDocument,type Triple} from './mapDocument';
const Footprints=memo(function Footprints({boxes}:{boxes:ReturnType<typeof editableBoxes>}){
 const roads=useMemo(()=>colliderPath(boxes.filter(b=>b.collection==='roads')),[boxes]),buildings=useMemo(()=>colliderPath(boxes.filter(b=>b.collection==='buildings')),[boxes]);
 return <><path d={roads} className="wb-roads"/><path d={buildings} className="wb-buildings"/></>;
});
export function ColliderPlan(){
 const doc=useBuilderStore(s=>s.doc),bounds=useBuilderStore(s=>s.bounds),selected=useBuilderStore(s=>s.selected),tool=useBuilderStore(s=>s.tool),snap=useBuilderStore(s=>s.snap);
 const boxes=useMemo(()=>doc?editableBoxes(doc):[],[doc]),box=boxes.find(b=>b.id===selected),mark=useRef<SVGRectElement>(null);
 const drag=useRef<{id:number;object:string;doc:MapDocument;start:[number,number];center:Triple;half:Triple;next:Triple}|null>(null);
 const point=(e:PointerEvent<SVGSVGElement>)=>bounds?planPoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),bounds):null;
 const reset=useCallback(()=>{const s=useBuilderStore.getState(),current=s.doc?editableBoxes(s.doc).find(b=>b.id===s.selected):null;if(mark.current&&current){mark.current.setAttribute('x',String(current.center[0]-current.half[0]));mark.current.setAttribute('y',String(current.center[2]-current.half[2]));}},[]);
 const cancel=useCallback(()=>{drag.current=null;reset();},[reset]);useControlRelease(cancel);
 const finish=(e:PointerEvent<SVGSVGElement>,cancel=false)=>{const held=drag.current;if(!held||held.id!==e.pointerId)return;drag.current=null;reset();if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);const state=useBuilderStore.getState();if(!cancel&&state.doc===held.doc&&state.selected===held.object&&held.next.some((n,i)=>n!==held.center[i]))state.edit(held.next,held.half);};
 if(!doc||!bounds)return null;
 return <svg className="wb-plan" viewBox={`${bounds.x} ${bounds.z} ${bounds.width} ${bounds.depth}`} role="img" aria-label="Collider plan: select a footprint; use Move to drag on the grid" preserveAspectRatio="xMidYMid meet"
  onPointerDown={e=>{if(e.button!==0||drag.current)return;const p=point(e);if(!p)return;e.preventDefault();const chosen=pickBox(boxes,...p);useBuilderStore.getState().select(chosen?.id??null);if(chosen&&tool==='move'){drag.current={id:e.pointerId,object:chosen.id,doc,start:p,center:[...chosen.center],half:[...chosen.half],next:[...chosen.center]};e.currentTarget.setPointerCapture?.(e.pointerId);}}}
  onPointerMove={e=>{const held=drag.current,p=point(e);if(!held||held.id!==e.pointerId||!p)return;if(useBuilderStore.getState().doc!==held.doc||useBuilderStore.getState().selected!==held.object){cancel();return;}held.next=[snapValue(held.center[0]+p[0]-held.start[0],snap),held.center[1],snapValue(held.center[2]+p[1]-held.start[1],snap)];if(mark.current){mark.current.setAttribute('x',String(held.next[0]-held.half[0]));mark.current.setAttribute('y',String(held.next[2]-held.half[2]));}}}
  onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}>
  <rect x={bounds.x} y={bounds.z} width={bounds.width} height={bounds.depth} fill="#07131d"/>
  <rect x={-doc.cell[0]/2} y={-doc.cell[1]/2} width={doc.cell[0]} height={doc.cell[1]} className="wb-cell"/>
  <path d={`M${bounds.x} 0h${bounds.width}M0 ${bounds.z}v${bounds.depth}`} className="wb-axes"/>
  <Footprints boxes={boxes}/>
  {box&&<rect ref={mark} x={box.center[0]-box.half[0]} y={box.center[2]-box.half[2]} width={box.half[0]*2} height={box.half[2]*2} className="wb-selection"/>}
 </svg>;
}
