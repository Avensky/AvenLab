import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const paths=execFileSync('git',['ls-files','*.glb'],{encoding:'utf8'}).trim().split('\n');
const assets=paths.map(path=>{
 if(!fs.existsSync(path))return {path,status:'not-checked-out'};
 const bytes=fs.readFileSync(path);
 if(bytes.readUInt32LE(0)!==0x46546c67)return {path,status:'lfs-pointer'};
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const nodes=doc.nodes??[];
 return {path,status:'available',nodes:nodes.length,meshes:doc.meshes?.length??0,skins:doc.skins?.length??0,animations:doc.animations?.length??0,
  components:nodes.flatMap((n,i)=> /^(WHEEL_|SPIN_|CALIPER_|Turret$|Cannon$|Headlight|LightLenses|ROTOR)/i.test(n.name??'')?[{node:i,name:n.name}]:[]),
  unnamed:nodes.filter(n=>!n.name).length,
  materials:(doc.materials??[]).map((m,i)=>({index:i,name:m.name??null}))};
});
fs.mkdirSync('docs/asset-audit',{recursive:true});
fs.writeFileSync('docs/asset-audit/glb-components.json',JSON.stringify({assets},null,2)+'\n');
console.log(JSON.stringify({total:assets.length,available:assets.filter(a=>a.status==='available').length,unavailable:assets.filter(a=>a.status!=='available').length}));
