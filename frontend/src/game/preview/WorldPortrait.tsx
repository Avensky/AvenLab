import {useEffect,useRef,useState} from 'react';
import type {MapDefinition} from '../../store/selection/worldCatalog';
import {drawWorldPortrait,worldPreviewShapes,type WorldShape} from './WorldPortrait';
import './worldPortrait.css';
const cache=new Map<string,WorldShape[]>();
export function WorldPortrait({map}:{map:MapDefinition}){
 const canvas=useRef<HTMLCanvasElement>(null),[status,setStatus]=useState('LOADING MAP PREVIEW');
 useEffect(()=>{
  let current=true;const abort=new AbortController();
  const show=(shapes:WorldShape[])=>{if(!current)return;if(canvas.current)drawWorldPortrait(canvas.current,shapes);setStatus(shapes.length?'MAP GEOMETRY PREVIEW':'PREVIEW PENDING');};
  if(cache.has(map.id))show(cache.get(map.id)!);
  else void fetch(`/world-builder/${map.id}_colliders.json`,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(doc=>{const shapes=worldPreviewShapes(doc);if(cache.size>=12)cache.delete(cache.keys().next().value!);cache.set(map.id,shapes);show(shapes);}).catch(()=>{if(current){if(canvas.current)drawWorldPortrait(canvas.current,[]);setStatus('PREVIEW PENDING');}});
  return()=>{current=false;abort.abort();};
 },[map.id]);
 return <figure className="world-portrait" aria-label={`Environment portrait: ${map.name}`}><canvas ref={canvas} width={540} height={340} role="img" aria-label={`${map.name} map geometry`}/><figcaption><small>{status}</small><strong>{map.name}</strong><span>{map.desc}</span></figcaption></figure>;
}
