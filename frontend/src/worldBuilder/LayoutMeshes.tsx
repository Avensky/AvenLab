import {memo, useEffect, useLayoutEffect, useMemo, useRef} from 'react';
import {BoxGeometry, Color, InstancedMesh, Object3D} from 'three';
import {createWedgeGeometry} from './layoutGeometry';
import {partTransform, type LayoutObject, type LayoutPart} from './layoutDocument';

function useGeometries() {
  const geometries = useMemo(() => ({box: new BoxGeometry(), wedge: createWedgeGeometry()}), []);
  useEffect(() => () => {geometries.box.dispose(); geometries.wedge.dispose();}, [geometries]);
  return geometries;
}
type Instance = {item: LayoutObject; part: LayoutPart};
function ShapeInstances({items, shape, wireframe, onSelect}: {items: Instance[]; shape: 'box' | 'wedge'; wireframe: boolean; onSelect?: (id: string) => void}) {
  const mesh = useRef<InstancedMesh>(null), geometries = useGeometries();
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D(), tint = new Color();
    items.forEach(({item, part}, i) => {
      const value = partTransform(item, part);
      transform.position.fromArray(value.position); transform.rotation.set(0, value.yaw, 0); transform.scale.fromArray(value.size); transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
      mesh.current!.setColorAt(i, tint.set(part.color ?? item.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh key={items.length} ref={mesh} args={[geometries[shape], undefined, items.length]}
    onClick={onSelect ? e => {if (e.button === 0 && e.delta < 5 && e.instanceId !== undefined) {e.stopPropagation(); onSelect(items[e.instanceId].item.id);}} : undefined}>
    <meshStandardMaterial roughness={.9} metalness={.025} wireframe={wireframe}/>
  </instancedMesh>;
}
// Two instanced draws for any palette mix; no duplicate geometry per object.
export const LayoutInstances = memo(function LayoutInstances({objects, exclude = null, wireframe = false, collisionOnly = false, onSelect}: {
  objects: LayoutObject[]; exclude?: string | null; wireframe?: boolean; collisionOnly?: boolean; onSelect?: (id: string) => void;
}) {
  const items = useMemo(() => objects.filter(o => o.id !== exclude && (!collisionOnly || o.solid)).flatMap(item =>
    item.parts.filter(part => !collisionOnly || part.solid !== false).map(part => ({item, part}))), [objects, exclude, collisionOnly]);
  const boxes = useMemo(() => items.filter(i => i.part.shape === 'box'), [items]);
  const wedges = useMemo(() => items.filter(i => i.part.shape === 'wedge'), [items]);
  return <><ShapeInstances items={boxes} shape="box" wireframe={wireframe} onSelect={onSelect}/><ShapeInstances items={wedges} shape="wedge" wireframe={wireframe} onSelect={onSelect}/></>;
});

// Normalized local geometry lets TransformControls resize a whole compound
// piece without losing its doorway or turning a ramp into a bounding box.
export function PieceModel({item, ghost = false, selected = false, wireframe = false, collisionOnly = false}: {item: LayoutObject; ghost?: boolean; selected?: boolean; wireframe?: boolean; collisionOnly?: boolean}) {
  const geometries = useGeometries();
  return <>
    {item.parts.filter(part => !collisionOnly || (item.solid && part.solid !== false)).map((part, i) => <mesh key={i} geometry={geometries[part.shape]} position={part.position} scale={part.size}>
      <meshStandardMaterial color={ghost ? '#bde5b2' : part.color ?? item.color} roughness={.9} metalness={.025}
        transparent={ghost} opacity={ghost ? .48 : 1} depthWrite={!ghost} wireframe={wireframe}/>
    </mesh>)}
    {selected && <mesh position={[0, .5, 0]} renderOrder={10}>
      <boxGeometry args={[1.025, 1.025, 1.025]}/><meshBasicMaterial color="#d6efb6" wireframe depthTest={false} transparent opacity={.8}/>
    </mesh>}
  </>;
}
