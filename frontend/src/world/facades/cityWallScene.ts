import {BufferGeometry, Float32BufferAttribute, Mesh, type Material, type Object3D} from 'three';
import { panelGeometry, wallPanels } from './wallGeometry';

const cache=new WeakMap<Object3D,Object3D>();
export function cityWallScene(source:Object3D) {
  const existing=cache.get(source);
  if(existing) return existing;
  if(!source.getObjectByName('Block_0_0')) return source;
  const scene=source.clone(true);
  const materials=new Map<string,Material>();
  scene.traverse(o=>{
    if(o instanceof Mesh) for(const m of [o.material].flat()) materials.set(m.name,m);
  });
  // Group by block and material for the existing instanced city LOD renderer.
  const blocks=new Map<string,Map<string,number[][]>>();
  for(const [lot,materials] of Object.entries(wallPanels)) {
    const block=lot.slice(0,9).replace('block','Block');
    const group=blocks.get(block) ?? new Map<string,number[][]>();
    blocks.set(block,group);
    for(const [name,panels] of Object.entries(materials)) group.set(name,[...(group.get(name)??[]),...panels]);
  }
  for(const [name,group] of blocks) {
    const parent=scene.getObjectByName(name);
    if(!parent) continue;
    for(const [label,panels] of group) {
      const material=materials.get(label);
      if(!material) continue;
      const {position,normal,uv,index}=panelGeometry(panels);
      const geometry=new BufferGeometry();
      geometry.setAttribute('position',new Float32BufferAttribute(position,3));
      geometry.setAttribute('normal',new Float32BufferAttribute(normal,3));
      geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
      geometry.setIndex(index);
      const mesh=new Mesh(geometry,material);
      mesh.name=name+'_facade_'+label;
      // Panels are measured in source-world coordinates.
      parent.updateWorldMatrix(true,false);
      mesh.matrix.copy(parent.matrixWorld).invert();mesh.matrixAutoUpdate=false;
      parent.add(mesh);
    }
  }
  cache.set(source,scene);
  return scene;
}
