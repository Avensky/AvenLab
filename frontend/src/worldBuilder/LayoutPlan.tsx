import {localBounds, snapLayoutPosition, type LayoutSnapLock} from './roads/layoutSnapping';
import {roadAsset, roleSolid, roleVisible} from './roads/roadCatalog';
import {useCallback, useMemo, useRef, useState, type PointerEvent} from 'react';
import {useLayoutStore, layoutAction} from './layoutStore';
import {footprint, partTransform, pieceById, snap, type LayoutObject, type V3, type WorldLayout} from './layoutDocument';
import {planPoint, type PlanBounds} from './mapDocument';
import {useEffect} from 'react';

function planFrame(objects: LayoutObject[]): PlanBounds {
  const points = objects.flatMap(footprint), x = Math.min(-35, ...points.map(p => p[0])), z = Math.min(-35, ...points.map(p => p[1]));
  const width = Math.max(35, ...points.map(p => p[0])) - x, depth = Math.max(35, ...points.map(p => p[1])) - z;
  return {x: x - 10, z: z - 10, width: width + 20, depth: depth + 20};
}
const pointsFor = (o: LayoutObject) => footprint(o).map(p => p.join(',')).join(' ');
function PieceFootprint({item, ghost = false, collisionOnly = false}: {item: LayoutObject; ghost?: boolean; collisionOnly?: boolean}) {
  if(item.road){
    const asset=roadAsset(item.road.asset)!,r=-item.yaw;
    return <g transform={`translate(${item.position[0]} ${item.position[2]}) rotate(${r}) scale(${item.size[0]/asset.size[0]} ${item.size[2]/asset.size[2]})`} opacity={ghost?.5:1}>
      {asset.colliders.filter(c=>collisionOnly ? item.solid&&roleSolid(c.role,item.road!):roleVisible(c.role,item.road!.variant)).map(c=><path key={c.role} d={c.indices.map(tri=>tri.map((index,k)=>`${k?'L':'M'}${c.vertices[index][0]} ${c.vertices[index][2]}`).join('')+'Z').join('')} fill={collisionOnly?'none':c.role==='surface'?'#33475d':'#889ca5'} stroke={collisionOnly?'#50e5b2':'none'} strokeWidth=".5" vectorEffect="non-scaling-stroke"/>)}
    </g>;
  }
  return <g opacity={ghost ? .5 : 1}>{item.parts.filter(p=>!collisionOnly||(item.solid&&p.solid!==false)).map((part, i) => {
    const t = partTransform(item, part), local = {...item, position: [t.position[0], 0, t.position[2]] as V3, size: t.size};
    return <polygon key={i} points={pointsFor(local)} fill={collisionOnly?'none':ghost ? '#64e3bf' : part.color ?? item.color} stroke={collisionOnly?'#4ce2b0':'#0b1926'} strokeWidth={collisionOnly?'1':'.5'} vectorEffect="non-scaling-stroke"/>;
  })}{item.piece === 'ramp' && <path d={`M${item.position[0]} ${item.position[2] + item.size[2] * .3}v${-item.size[2] * .6}m-1 2 1-2 1 2`} transform={`rotate(${-item.yaw},${item.position[0]},${item.position[2]})`} fill="none" stroke="#f3edcf" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>}</g>;
}
export function LayoutPlan() {
  const doc = useLayoutStore(s => s.doc), selected = useLayoutStore(s => s.selected), placing = useLayoutStore(s => s.placing),
    yaw = useLayoutStore(s => s.placementYaw), cursor = useLayoutStore(s => s.cursor), tool = useLayoutStore(s => s.tool), grid = useLayoutStore(s => s.snap);
  const wireframe=useLayoutStore(s=>s.wireframe);
  const [view, setView] = useState(() => planFrame(doc?.objects ?? []));
  const magnetLock = useRef<LayoutSnapLock | null>(null);
  const magnetic = (item:LayoutObject,position:V3) => {const state=useLayoutStore.getState();if(!state.magnet)return position;const result=snapLayoutPosition(item,position,state.doc?.objects??[],state.snapBasis,state.magnetRadius,magnetLock.current);magnetLock.current=result.lock;return result.position;};
  const selection = useRef<SVGGElement>(null), ghost = useRef<SVGGElement>(null);
  const drag = useRef<{pointer: number; doc: WorldLayout; item: LayoutObject; start: [number, number]; next: V3} | null>(null);
  const pan = useRef<{pointer: number; start: [number, number]; view: PlanBounds} | null>(null);
  const cancel = useCallback(() => {drag.current = null; pan.current = null; magnetLock.current = null; selection.current?.removeAttribute('transform');}, []);
  useEffect(() => {const hidden = () => {if (document.visibilityState === 'hidden') cancel();}; const abort=(e:Event)=>{if(drag.current||pan.current){cancel();e.preventDefault();}};window.addEventListener('avenlab:cancel-authoring',abort); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden); return () => {window.removeEventListener('avenlab:cancel-authoring',abort);window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); cancel();};}, [cancel]);
  const piece = placing ? pieceById(placing) : undefined;
  const phantom = piece ? {id: 'ghost', name: '', piece: piece.id, position: [0, 0, 0] as V3, size: piece.size, yaw, color: piece.color, locked: false, solid: true, parts: piece.parts, ...(piece.road ? {road:piece.road} : {})} : null;
  const items = useMemo(() => doc?.objects ?? [], [doc]);
  const point = (e: PointerEvent<SVGSVGElement>) => planPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), view);
  const finish = (e: PointerEvent<SVGSVGElement>, abort = false) => {
    const held = drag.current; cancel();
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!abort && held && held.pointer === e.pointerId && useLayoutStore.getState().doc === held.doc && held.next.some((v, i) => v !== held.item.position[i])) layoutAction(() => useLayoutStore.getState().update({position: held.next}));
  };
  return <svg className="layout-plan" aria-label="Map plan" role="img" viewBox={`${view.x} ${view.z} ${view.width} ${view.depth}`} onContextMenu={e => e.preventDefault()}
    onWheel={e => {const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12; setView(v => {const width = Math.max(10, Math.min(2000, v.width * factor)), ratio = width / v.width; return {x: v.x + v.width * (1 - ratio) / 2, z: v.z + v.depth * (1 - ratio) / 2, width, depth: v.depth * ratio};});}}
    onPointerDown={e => {
      if (drag.current || pan.current || !doc) return;
      const p = point(e); if (!p) return;
      if (e.button === 1 || e.button === 2) {e.preventDefault(); pan.current = {pointer: e.pointerId, start: p, view}; e.currentTarget.setPointerCapture?.(e.pointerId); return;}
      if (e.button !== 0) return; e.preventDefault();
      if (placing) {layoutAction(() => useLayoutStore.getState().place(phantom?magnetic(phantom,[snap(p[0],grid),cursor[1],snap(p[1],grid)]):[snap(p[0],grid),cursor[1],snap(p[1],grid)])); return;}
      const hit = [...items].reverse().find(item => {const a = item.yaw * Math.PI / 180, x = p[0] - item.position[0], z = p[1] - item.position[2]; const b=localBounds(item),lx=Math.cos(a)*x-Math.sin(a)*z,lz=Math.sin(a)*x+Math.cos(a)*z;return lx>=b.min[0]&&lx<=b.max[0]&&lz>=b.min[2]&&lz<=b.max[2];});
      useLayoutStore.getState().select(hit?.id ?? null);
      if (hit && !hit.locked && tool === 'translate') {drag.current = {pointer: e.pointerId, doc, item: hit, start: p, next: [...hit.position]}; e.currentTarget.setPointerCapture?.(e.pointerId);}
    }}
    onPointerMove={e => {
      if (pan.current?.pointer === e.pointerId) {const held = pan.current, rect = e.currentTarget.getBoundingClientRect(), ratio = Math.min(rect.width / held.view.width, rect.height / held.view.depth); const p = planPoint(e.clientX, e.clientY, rect, held.view); if (p && ratio > 0) setView({...held.view, x: held.view.x - p[0] + held.start[0], z: held.view.z - p[1] + held.start[1]}); return;}
      const p = point(e); if (!p) return;
      if (placing && ghost.current && phantom) {const next=magnetic(phantom,[snap(p[0],grid),cursor[1],snap(p[1],grid)]);ghost.current.setAttribute('transform',`translate(${next[0]} ${next[2]})`);}
      const held = drag.current;
      if (held && held.pointer === e.pointerId) {if (useLayoutStore.getState().doc !== held.doc || useLayoutStore.getState().selected !== held.item.id) {cancel(); return;}
        held.next = magnetic(held.item,[snap(held.item.position[0]+p[0]-held.start[0],grid),held.item.position[1],snap(held.item.position[2]+p[1]-held.start[1],grid)]);
        selection.current?.setAttribute('transform', `translate(${held.next[0] - held.item.position[0]} ${held.next[2] - held.item.position[2]})`);
      }
    }} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onLostPointerCapture={e => finish(e, true)}>
    <defs><pattern id="layout-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#25475f" strokeWidth=".12"/></pattern></defs>
    <rect x={view.x} y={view.z} width={view.width} height={view.depth} fill="#0e2031"/><rect x={view.x} y={view.z} width={view.width} height={view.depth} fill="url(#layout-grid)"/>
    <path d={`M${view.x} 0h${view.width}M0 ${view.z}v${view.depth}`} stroke="#43e0ac" opacity=".3" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
    {items.filter(o => o.id !== selected).map(item => <PieceFootprint key={item.id} item={item} collisionOnly={wireframe}/>)}
    <g ref={selection}>{items.filter(o => o.id === selected).map(item => <g key={item.id}><PieceFootprint item={item} collisionOnly={wireframe}/><polygon points={pointsFor(item)} fill="none" stroke="#55caff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></g>)}</g>
    {phantom && <g ref={ghost} transform={`translate(${cursor[0]} ${cursor[2]})`} pointerEvents="none"><PieceFootprint item={phantom} ghost/></g>}
  </svg>;
}
