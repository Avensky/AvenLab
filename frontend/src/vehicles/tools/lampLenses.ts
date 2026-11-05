import {Mesh,MeshStandardMaterial,type Material,type Object3D} from 'three';

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
      const cover=named || (/^(head|tail)(light|lamp).*?(cover|lens|glass)|^lightlenses/i.test(node.name) && !Array.isArray(original));
      const alwaysRed=/^color_b03_1$/.test(name) && m instanceof MeshStandardMaterial;
      if(!cover&&!alwaysRed)return m;
      let lens=owned.get(m);
      if(!lens){
        lens=m.clone();
        if(cover){
          lens.transparent=true;lens.alphaTest=0;lens.depthWrite=false;
          lens.opacity=m.opacity>0 ? Math.min(m.opacity,named ? .48 : .32) : .22;
        }
        if(alwaysRed && lens instanceof MeshStandardMaterial) lens.emissiveIntensity=0;
        owned.set(m,lens);
      }
      return lens;
    };
    const next=Array.isArray(original)?original.map(adapt):adapt(original);
    if(Array.isArray(original)?(next as Material[]).some((m,i)=>m!==original[i]):next!==original){
      restore.push([node,original]);node.material=next;
    }
  });
  return ()=>{for(const [node,original] of restore)node.material=original;for(const m of owned.values())m.dispose();};
}
