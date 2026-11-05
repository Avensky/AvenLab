import {Mesh,MeshStandardMaterial,type Material,type Object3D} from 'three';

/** Reflect the plate's own letters and atlas when its bulbs are on. Each
 * instance owns its emissive settings; no point lights or shadows are added. */
export function mountPlateLights(root:Object3D) {
  const plates=new Map<Material,MeshStandardMaterial>(),originals:Array<[Mesh,Material|Material[]]>=[];
  root.traverse(node=>{
    if(!(node instanceof Mesh))return;
    const old=node.material;
    const adapt=(m:Material)=>{
      if(!(m instanceof MeshStandardMaterial) || !/(license|licence|number)[ _-]*plate/i.test(m.name+' '+(!Array.isArray(old)?node.name:'')))return m;
      let plate=plates.get(m);
      if(!plate){plate=m.clone();plate.emissive.set('#fff1cd');plate.emissiveMap=plate.map;plate.emissiveIntensity=0;plates.set(m,plate);}
      return plate;
    };
    const next=Array.isArray(old)?old.map(adapt):adapt(old);
    if(Array.isArray(old)?(next as Material[]).some((m,i)=>m!==old[i]):next!==old){originals.push([node,old]);node.material=next;}
  });
  let last=false;
  return {count:plates.size,setNight(night:boolean){if(night===last)return;last=night;for(const plate of plates.values())plate.emissiveIntensity=night ? 0.42 : 0;},
    dispose(){for(const [node,old] of originals)node.material=old;for(const plate of plates.values())plate.dispose();}};
}
