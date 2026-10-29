import {ChunkGuide} from './ChunkGuide';
import {EDITOR_THEMES,useEditorPreferences} from './editorPreferences';
import {localBounds, snapLayoutPosition, type LayoutSnapLock} from './roads/layoutSnapping';
import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Html, OrbitControls, PerspectiveCamera, TransformControls} from '@react-three/drei';
import {Group} from 'three';
import type {TransformControls as TransformControlsImpl} from 'three-stdlib';
import {useLayoutStore, layoutAction} from './layoutStore';
import {footprint, pieceById, snap, type LayoutObject, type V3} from './layoutDocument';
import {LayoutInstances, PieceModel} from './LayoutMeshes';
import {useBuilderStore} from './builderStore';
import {CityChunk} from '../world/CityChunk';
import {AssetBoundary} from '../components/debugger/AssetBoundary';

function layoutFrame(objects: LayoutObject[], tight=false) {
  const points=objects.flatMap(footprint),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const minX=tight&&points.length?Math.min(...xs):Math.min(-20,...xs),maxX=tight&&points.length?Math.max(...xs):Math.max(20,...xs);
  const minZ=tight&&points.length?Math.min(...zs):Math.min(-20,...zs),maxZ=tight&&points.length?Math.max(...zs):Math.max(20,...zs);
  const lows=objects.map(o=>o.position[1]+localBounds(o).min[1]),highs=objects.map(o=>o.position[1]+localBounds(o).max[1]);
  const minY=tight&&objects.length?Math.min(...lows):Math.min(0,...lows),maxY=tight&&objects.length?Math.max(...highs):Math.max(0,...highs);
  return {center:[(minX+maxX)/2,(minY+maxY)*(tight?.5:.25),(minZ+maxZ)/2] as V3,span:Math.max(tight?10:65,maxX-minX,maxZ-minZ,(maxY-minY)*1.5)*(tight?2.4:1.65)};
}
function SelectedObject({item}: {item: LayoutObject}) {
  const mode = useLayoutStore(s => s.tool), grid = useLayoutStore(s => s.snap), angle = useLayoutStore(s => s.angleSnap), wireframe = useLayoutStore(s => s.wireframe);
  const target = useRef<Group>(null), controls = useRef<TransformControlsImpl>(null);
  const magnetLock = useRef<LayoutSnapLock | null>(null);
  const held = useRef<{doc: unknown; id: string} | null>(null), enabled = !item.locked && mode !== 'select';
  const cancel = useCallback(() => {
    if (!held.current) return false;
    held.current = null; magnetLock.current = null; controls.current?.reset();
    const s = useLayoutStore.getState(), object = s.doc?.objects.find(o => o.id === s.selected);
    if (object && target.current) {target.current.position.fromArray(object.position); target.current.scale.fromArray(object.size); target.current.rotation.set(0, object.yaw * Math.PI / 180, 0);}
    return true;
  }, []);
  useEffect(() => {
    const escape = (e: Event) => {if (cancel()) e.preventDefault();};
    const hidden = () => {if (document.visibilityState === 'hidden') cancel();};
    window.addEventListener('avenlab:cancel-authoring', escape); window.addEventListener('blur', cancel);window.addEventListener('pointercancel',cancel);window.addEventListener('lostpointercapture',cancel); document.addEventListener('visibilitychange', hidden);
    return () => {window.removeEventListener('avenlab:cancel-authoring', escape); window.removeEventListener('blur', cancel);window.removeEventListener('pointercancel',cancel);window.removeEventListener('lostpointercapture',cancel); document.removeEventListener('visibilitychange', hidden); cancel();};
  }, [cancel]);
  return <TransformControls ref={controls} mode={mode === 'select' ? 'translate' : mode} enabled={enabled}
    showX={enabled && mode !== 'rotate'} showY={enabled} showZ={enabled && mode !== 'rotate'}
    translationSnap={grid} rotationSnap={angle * Math.PI / 180} scaleSnap={.05} size={.8}
    onMouseDown={() => {magnetLock.current = null; held.current = {doc: useLayoutStore.getState().doc, id: item.id};}}
    onObjectChange={() => {
      const state=useLayoutStore.getState(), object=target.current;
      if (!held.current || !object || mode!=='translate' || !state.magnet) return;
      const result=snapLayoutPosition(item,object.position.toArray() as V3,state.doc?.objects??[],state.snapBasis,state.magnetRadius,magnetLock.current);
      object.position.fromArray(result.position); magnetLock.current=result.lock;
    }}
    onMouseUp={() => {
      const drag = held.current, s = useLayoutStore.getState(), object = target.current;
      held.current = null; magnetLock.current = null;
      if (!drag || !object || drag.doc !== s.doc || drag.id !== s.selected) return;
      layoutAction(() => s.update({position: object.position.toArray() as V3, size: object.scale.toArray() as V3, yaw: object.rotation.y * 180 / Math.PI}));
      // Invalid transforms restore the committed geometry immediately.
      const current = useLayoutStore.getState().doc?.objects.find(o => o.id === drag.id);
      if (current) {object.position.fromArray(current.position); object.scale.fromArray(current.size); object.rotation.set(0, current.yaw * Math.PI / 180, 0);}
    }}>
    <group ref={target} name={`road-${item.id}`} position={item.position} rotation={[0, item.yaw * Math.PI / 180, 0]} scale={item.size}
      onClick={e => {if (e.delta < 5) e.stopPropagation();}}>
      <PieceModel item={item} selected wireframe={wireframe} collisionOnly={wireframe}/>
    </group>
  </TransformControls>;
}
export default function LayoutScene() {
  const palette=EDITOR_THEMES[useEditorPreferences(s=>s.theme)];
  const doc = useLayoutStore(s => s.doc), selected = useLayoutStore(s => s.selected), placing = useLayoutStore(s => s.placing),
    cursor = useLayoutStore(s => s.cursor), yaw = useLayoutStore(s => s.placementYaw), grid = useLayoutStore(s => s.snap),
    camera = useLayoutStore(s => s.camera), reference = useLayoutStore(s => s.reference), wireframe = useLayoutStore(s => s.wireframe);
  const focus=useLayoutStore(s=>s.focus);
  const source = useBuilderStore(s => s.doc), ghost = useRef<Group>(null);
  const [frame] = useState(() => reference && source && focus!=='selected' ? {center: [0, source.surface.road_y, 0] as V3, span: Math.max(...source.cell) * 1.2} : layoutFrame(focus==='selected'&&selected?doc?.objects.filter(o=>o.id===selected)??[]:doc?.objects??[],focus==='selected'));
  const selectedObject = doc?.objects.find(o => o.id === selected), piece = placing ? pieceById(placing) : undefined;
  const phantom = useMemo<LayoutObject | null>(() => piece ? ({id: 'preview', name: piece.label, piece: piece.id, position: cursor, size: piece.size, yaw, color: piece.color, locked: false, solid: true, parts: piece.parts, ...(piece.road ? {road: piece.road} : {}), ...(piece.model?{model:piece.model}:{})}) : null, [piece, cursor, yaw]);
  const hoverLock=useRef<LayoutSnapLock|null>(null);
  const previewPosition=(position:V3)=>{const state=useLayoutStore.getState(); if(!phantom||!state.magnet)return position; const result=snapLayoutPosition(phantom,position,state.doc?.objects??[],state.snapBasis,state.magnetRadius,hoverLock.current);hoverLock.current=result.lock;return result.position;};
  const select = useCallback((id: string | null) => useLayoutStore.getState().select(id), []);
  const floor = source?.surface.road_y ?? 0;
  return <group name="layout-authoring-scene">
    <color attach="background" args={[palette.background]}/><fog attach="fog" args={[palette.background,320,950]}/>
    <hemisphereLight args={['#d5eaf8', '#102535', 2]}/><directionalLight position={[-60, 100, 40]} intensity={2.8} color="#edf6ff"/>
    <PerspectiveCamera makeDefault position={camera === 'top' ? [frame.center[0], frame.center[1]+frame.span * 1.25, frame.center[2] + .001] : [frame.center[0] + frame.span * .65, frame.center[1]+frame.span * .65, frame.center[2] + frame.span * .7]} fov={42} near={1} far={3000}/>
    <OrbitControls makeDefault target={frame.center} enableRotate={camera !== 'top'} maxPolarAngle={Math.PI / 2 - .015} minDistance={3} maxDistance={1800}/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floor - .15, 0]}
      onPointerMove={e => {if (ghost.current && placing) {ghost.current.visible = true; ghost.current.position.fromArray(previewPosition([snap(e.point.x,grid),cursor[1],snap(e.point.z,grid)]));}}}
      onClick={e => {if (e.delta >= 5 || e.button !== 0) return; e.stopPropagation(); if (placing) layoutAction(() => useLayoutStore.getState().place(previewPosition([snap(e.point.x,grid),cursor[1],snap(e.point.z,grid)]))); else select(null);}}>
      <planeGeometry args={[10000,10000]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
    </mesh>
    {doc?.ground !== false && <mesh rotation={[-Math.PI/2,0,0]} position={[0,floor-.15,0]}><planeGeometry args={source?source.cell:[200,200]}/><meshStandardMaterial color={palette.floor} roughness={1}/></mesh>}
    <gridHelper args={[1000,200,palette.axis,palette.grid]} position={[0, floor-.125, 0]}/>
    <ChunkGuide floor={floor}/>
    {source && reference && source.visuals.map(visual => <AssetBoundary key={visual.id} fallback={<Html center><span className="layout-reference-error">Reference model unavailable: {visual.id}</span></Html>}>
      <Suspense fallback={null}><CityChunk path={visual.asset} position={visual.position} quaternion={visual.rotation} scale={visual.scale}/></Suspense>
    </AssetBoundary>)}
    {doc && <LayoutInstances objects={doc.objects} exclude={placing ? null : selected} onSelect={placing ? undefined : select} wireframe={wireframe} collisionOnly={wireframe}/>}
    {selectedObject && !placing && <SelectedObject key={selectedObject.id} item={selectedObject}/>}
    {phantom && <group ref={ghost} position={cursor} rotation={[0, yaw * Math.PI / 180, 0]} scale={phantom.size}><PieceModel item={phantom} ghost/></group>}
  </group>;
}
