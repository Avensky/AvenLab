import {LayoutInstances} from '../worldBuilder/LayoutMeshes';
import type {WorldLayout} from '../worldBuilder/layoutDocument';
import type {RenderMode} from '../store/worldStore';

// The server snapshot owns installed content. Browser drafts never enter here.
export function AuthoredWorld({layout, mode, cell, surface}: {layout: WorldLayout; mode: RenderMode | 'hidden'; cell: [number, number]; surface: number}) {
  if(mode === 'hidden')return null;
  return <group name="authored-world">{layout.base === 'replace' && mode !== 'collider' && <mesh position={[0, surface - .25, 0]}><boxGeometry args={[cell[0], .5, cell[1]]}/><meshStandardMaterial color="#284139" roughness={1}/></mesh>}<LayoutInstances objects={layout.objects} wireframe={mode === 'collider'} collisionOnly={mode === 'collider'}/></group>;
}
