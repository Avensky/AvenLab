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

function layoutFrame(objects: LayoutObject[]) {
  const points = objects.flatMap(footprint);
  const minX = Math.min(-20, ...points.map(p => p[0])), maxX = Math.max(20, ...points.map(p => p[0]));
  const minZ = Math.min(-20, ...points.map(p => p[1])), maxZ = Math.max(20, ...points.map(p => p[1]));
  const minY=Math.min(0,...objects.map(o=>o.position[1])),maxY=Math.max(0,...objects.map(o=>o.position[1]+o.size[1]));
  return {center: [(minX + maxX) / 2, (minY+maxY)*.25, (minZ + maxZ) / 2] as V3, span: Math.max(65, maxX - minX, maxZ - minZ,(maxY-minY)*1.5) * 1.65};
}
function SelectedObject({item}: {item: LayoutObject}) {
  const mode = useLayoutStore(s => s.tool), grid = useLayoutStore(s => s.snap), angle = useLayoutStore(s => s.angleSnap), wireframe = useLayoutStore(s => s.wireframe);
  const target = useRef<Group>(null), controls = useRef<TransformControlsImpl>(null);
  const held = useRef<{doc: unknown; id: string} | null>(null), enabled = !item.locked && mode !== 'select';
  const cancel = useCallback(() => {
    if (!held.current) return false;
    held.current = null; controls.current?.reset();
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
    onMouseDown={() => {held.current = {doc: useLayoutStore.getState().doc, id: item.id};}}
    onMouseUp={() => {
      const drag = held.current, s = useLayoutStore.getState(), object = target.current;
      held.current = null;
      if (!drag || !object || drag.doc !== s.doc || drag.id !== s.selected) return;
      layoutAction(() => s.update({position: object.position.toArray() as V3, size: object.scale.toArray() as V3, yaw: object.rotation.y * 180 / Math.PI}));
      // Invalid transforms restore the committed geometry immediately.
      const current = useLayoutStore.getState().doc?.objects.find(o => o.id === drag.id);
      if (current) {object.position.fromArray(current.position); object.scale.fromArray(current.size); object.rotation.set(0, current.yaw * Math.PI / 180, 0);}
    }}>
    <group ref={target} position={item.position} rotation={[0, item.yaw * Math.PI / 180, 0]} scale={item.size}
      onClick={e => {if (e.delta < 5) e.stopPropagation();}}>
      <PieceModel item={item} selected wireframe={wireframe} collisionOnly={wireframe}/>
    </group>
  </TransformControls>;
}
export default function LayoutScene() {
  const doc = useLayoutStore(s => s.doc), selected = useLayoutStore(s => s.selected), placing = useLayoutStore(s => s.placing),
    cursor = useLayoutStore(s => s.cursor), yaw = useLayoutStore(s => s.placementYaw), grid = useLayoutStore(s => s.snap),
    camera = useLayoutStore(s => s.camera), reference = useLayoutStore(s => s.reference), wireframe = useLayoutStore(s => s.wireframe);
  const source = useBuilderStore(s => s.doc), ghost = useRef<Group>(null);
  const [frame] = useState(() => reference && source ? {center: [0, source.surface.road_y, 0] as V3, span: Math.max(...source.cell) * 1.2} : layoutFrame(doc?.objects ?? []));
  const selectedObject = doc?.objects.find(o => o.id === selected), piece = placing ? pieceById(placing) : undefined;
  const phantom = useMemo<LayoutObject | null>(() => piece ? ({id: 'preview', name: piece.label, piece: piece.id, position: cursor, size: piece.size, yaw, color: piece.color, locked: false, solid: true, parts: piece.parts}) : null, [piece, cursor, yaw]);
  const select = useCallback((id: string | null) => useLayoutStore.getState().select(id), []);
  const floor = source?.surface.road_y ?? 0;
  return <group name="layout-authoring-scene">
    <color attach="background" args={['#162b27']}/><fog attach="fog" args={['#162b27', 320, 950]}/>
    <hemisphereLight args={['#e4edd9', '#263e37', 2]}/><directionalLight position={[-60, 100, 40]} intensity={2.8} color="#fff2d2"/>
    <PerspectiveCamera makeDefault position={camera === 'top' ? [frame.center[0], frame.center[1]+frame.span * 1.25, frame.center[2] + .001] : [frame.center[0] + frame.span * .65, frame.center[1]+frame.span * .65, frame.center[2] + frame.span * .7]} fov={42} near={.1} far={3000}/>
    <OrbitControls makeDefault target={frame.center} enableRotate={camera !== 'top'} maxPolarAngle={Math.PI / 2 - .015} minDistance={3} maxDistance={1800}/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floor - .015, 0]}
      onPointerMove={e => {if (ghost.current && placing) {ghost.current.visible = true; ghost.current.position.set(snap(e.point.x, grid), cursor[1], snap(e.point.z, grid));}}}
      onClick={e => {if (e.delta >= 5 || e.button !== 0) return; e.stopPropagation(); if (placing) layoutAction(() => useLayoutStore.getState().place([snap(e.point.x, grid), cursor[1], snap(e.point.z, grid)])); else select(null);}}>
      <planeGeometry args={source ? source.cell : [200, 200]}/><meshStandardMaterial color="#284139" roughness={1}/>
    </mesh>
    <gridHelper args={[1000, 200, '#829972', '#536e4b']} position={[0, floor+.002, 0]}/>
    {source && reference && source.visuals.map(visual => <AssetBoundary key={visual.id} fallback={<Html center><span className="layout-reference-error">Reference model unavailable: {visual.id}</span></Html>}>
      <Suspense fallback={null}><CityChunk path={visual.asset} position={visual.position} quaternion={visual.rotation} scale={visual.scale}/></Suspense>
    </AssetBoundary>)}
    {doc && <LayoutInstances objects={doc.objects} exclude={placing ? null : selected} onSelect={placing ? undefined : select} wireframe={wireframe} collisionOnly={wireframe}/>}
    {selectedObject && !placing && <SelectedObject key={selectedObject.id} item={selectedObject}/>}
    {phantom && <group ref={ghost} position={cursor} rotation={[0, yaw * Math.PI / 180, 0]} scale={phantom.size}><PieceModel item={phantom} ghost/></group>}
  </group>;
}
