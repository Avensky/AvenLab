import {Mesh,type Material,type Object3D} from 'three';

/** Only an authored lens slot changes. Trim, lamp reflectors, windows and
 * the GLTF cache retain their material and depth-writing policies. */
export function prepareLampLenses(root:Object3D) {
  const owned=new Map<Material,Material>();
  const restore:Array<[Mesh,Material|Material[]]>=[];
  root.traverse(node=>{
    if (!(node instanceof Mesh)) return;
    const original=node.material;
    const adapt=(m:Material)=>{
      const name=m.name.toLowerCase();
      const named=/(lamp|light).*(glass|cover|lens)|(glass|cover|lens).*(lamp|light)|^(glass(red|amber)|(red|orange|amber|ambar|oarnge)_glass)(\.|$)/.test(name);
      if(!named && !(node.name.match(/head(light|lamp).*(cover|lens|glass)/i) && !Array.isArray(original)))return m;
      let lens=owned.get(m);
      if(!lens){lens=m.clone();lens.transparent=true;lens.opacity=Math.min(m.opacity,.48);lens.depthWrite=false;owned.set(m,lens);}
      return lens;
    };
    const next=Array.isArray(original)?original.map(adapt):adapt(original);
    if(Array.isArray(original)?(next as Material[]).some((m,i)=>m!==original[i]):next!==original){
      restore.push([node,original]);node.material=next;
    }
  });
  return ()=>{for(const [node,original] of restore)node.material=original;for(const m of owned.values())m.dispose();};
}
