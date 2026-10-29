import {Suspense,useEffect,useRef,useState} from 'react';
import {Canvas} from '@react-three/fiber';
import {OrbitControls,PerspectiveCamera} from '@react-three/drei';
import {PieceModel} from './LayoutMeshes';
import {pieceById,type LayoutObject} from './layoutDocument';
import {localBounds} from './roads/layoutSnapping';
import {EDITOR_THEMES,useEditorPreferences} from './editorPreferences';

function PreviewScene({item,collision,cutaway}:{item:LayoutObject;collision:boolean;cutaway:boolean}){
 const palette=EDITOR_THEMES[useEditorPreferences(s=>s.theme)],b=localBounds(item),center=b.min.map((n,i)=>(n+b.max[i])/2) as [number,number,number],span=Math.max(...item.size),preview=item.model&&cutaway?{...item,model:{...item.model,visible:{...item.model.visible,roof:false}}}:item;
 return <>
  <color attach="background" args={[palette.background]}/><hemisphereLight args={['#e7f1ff','#142539',2.8]}/><directionalLight position={[span,span*2,span]} intensity={3}/>
  <PerspectiveCamera makeDefault position={[center[0]+span*.95,center[1]+span*.85,center[2]+span*1.2]} fov={42} near={.02} far={span*20}/>
  <OrbitControls makeDefault target={center} minDistance={span*.15} maxDistance={span*4}/>
  <gridHelper args={[span*2,20,palette.axis,palette.grid]} position={[0,-.025,0]}/>
  <group scale={item.size}><PieceModel item={preview} wireframe={collision} collisionOnly={collision}/></group>
 </>;
}
export default function PiecePreview({pieceId,onClose,onPlace}:{pieceId:string;onClose:()=>void;onPlace:()=>void}){
 const piece=pieceById(pieceId)!,[collision,setCollision]=useState(false),[cutaway,setCutaway]=useState(false),dialog=useRef<HTMLElement>(null);
 const item:LayoutObject={id:'piece-preview',name:piece.label,piece:piece.id,position:[0,0,0],size:piece.size,yaw:0,color:piece.color,locked:false,solid:true,parts:piece.parts,...(piece.road?{road:piece.road}:{}),...(piece.model?{model:piece.model}:{})};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>previous?.focus();},[]);
 return <div className="le-modal-backdrop le-preview-backdrop"><section ref={dialog} role="dialog" aria-modal="true" aria-label={`Preview ${piece.label}`} className="le-piece-preview" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}else if(e.key==='Tab'){const buttons=[...(dialog.current?.querySelectorAll<HTMLElement>('button,input')??[])],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header><div><span className="le-small-label">PIECE PREVIEW</span><h2>{piece.label}</h2></div><button aria-label="Close piece preview" onClick={onClose}>×</button></header>
  <div className="le-piece-view"><Canvas frameloop="demand" dpr={[1,1.5]} gl={{antialias:true}} fallback={<p>3D preview unavailable. You can still place this piece in Plan.</p>}><Suspense fallback={null}><PreviewScene item={item} collision={collision} cutaway={cutaway}/></Suspense></Canvas><span className="le-preview-hint">Drag to orbit · Scroll to zoom</span></div>
  <div className="le-preview-controls"><label className="le-check"><input aria-label="Preview collisions" type="checkbox" checked={collision} onChange={e=>setCollision(e.target.checked)}/><span>Collision surfaces</span></label>{piece.model&&<label className="le-check"><input aria-label="Preview cutaway" type="checkbox" checked={cutaway} onChange={e=>setCutaway(e.target.checked)}/><span>Roof cutaway</span></label>}<span>{piece.size.map(n=>n.toFixed(2)).join(' × ')} m</span></div>
  <footer><p>{piece.description}</p><button className="le-primary" onClick={onPlace}>Place this piece</button></footer>
 </section></div>;
}
