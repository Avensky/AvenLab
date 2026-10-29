// Adds exportable parent nodes and splits material primitives by semantic role.
// Every original BIN byte, material, texture, accessor and mesh transform stays intact.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const input=path.resolve(process.argv[2]||'frontend/public/models/world/road-kit'),output=path.resolve(process.argv[3]||'road-kit-grouped');fs.mkdirSync(output,{recursive:true});
const manifest={format:'avenlab-road-source-groups',version:1,assets:[]};
for(const id of ['road_narrow','road_wide','intersection']){
 const raw=fs.readFileSync(path.join(input,id+'.glb'));if(raw.toString('ascii',0,4)!=='glTF'||raw.readUInt32LE(4)!==2)throw Error('Expected glTF 2');
 let json,bin;for(let at=12;at<raw.length;){const size=raw.readUInt32LE(at),type=raw.toString('ascii',at+4,at+8),bytes=raw.subarray(at+8,at+8+size);if(type==='JSON')json=JSON.parse(bytes.toString());else if(type.startsWith('BIN'))bin=bytes;at+=8+size;}
 if(!bin||json.animations?.length||json.skins?.length||json.nodes.some(n=>n.children?.length))throw Error('This grouper expects the inspected static, flat source hierarchy');
 const nodes=[],meshes=[],groups=new Map();const root={name:'Road_Module',children:[],extras:{avenlab:{source:id+'.glb',forward_axis:id==='road_wide'?'+x':'-z',left_side_axis:id==='road_wide'?'-z':'-x',geometry_changed:false}}};nodes.push(root);
 const group=(name,parent=0)=>{const key=parent+':'+name;if(groups.has(key))return groups.get(key);const index=nodes.push({name,children:[]})-1;nodes[parent].children.push(index);groups.set(key,index);return index;};
 const sourceNodes=json.nodes;
 for(const source of sourceNodes){if(source.mesh===undefined)continue;const mesh=json.meshes[source.mesh];for(const [pi,primitive] of mesh.primitives.entries()){
  const material=json.materials[primitive.material].name,position=json.accessors[primitive.attributes.POSITION],scale=source.scale??[1,1,1],translation=source.translation??[0,0,0];
  if(source.rotation||source.matrix)throw Error('A rotated source node requires an explicit role mapping');
  const center=position.min.map((v,k)=>translation[k]+(v+position.max[k])/2*scale[k]);
  let parent;
  if(material==='asphalt_01')parent=group('Road_Surface');else if(material==='MarkingRoad')parent=group('Road_Markings');
  else if(material.startsWith('Sidewalk_')){
   const side=id==='intersection'?`${center[2]<0?'N':'S'}${center[0]<0?'W':'E'}`:(center[id==='road_wide'?2:0]<0?'Left':'Right');
   parent=group(material==='Sidewalk_02'?'Curb':'Paving',group('Sidewalk_'+side));
  }else parent=group('Road_Details');
  const mi=meshes.push({...mesh,name:source.name+'_'+material,primitives:[primitive]})-1;
  const node={...source,name:source.name+'_'+material+'_'+pi,mesh:mi};delete node.children;nodes[parent].children.push(nodes.push(node)-1);
 }}
 const originalBinaryHash=crypto.createHash('sha256').update(bin).digest('hex');
 json.nodes=nodes;json.meshes=meshes;json.scenes=[{name:'AvenLab road module',nodes:[0]}];json.scene=0;
 json.asset={...json.asset,extras:{...json.asset.extras,avenlab_source_sha256:crypto.createHash('sha256').update(raw).digest('hex')}};
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),header=Buffer.alloc(12),jhead=Buffer.alloc(8),bhead=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+bin.length,8);jhead.writeUInt32LE(padded.length);jhead.write('JSON',4);bhead.writeUInt32LE(bin.length);bhead.write('BIN\0',4);
 const result=Buffer.concat([header,jhead,padded,bhead,bin]),file=id+'_grouped.glb';fs.writeFileSync(path.join(output,file),result);
 const end=result.subarray(result.length-bin.length);if(crypto.createHash('sha256').update(end).digest('hex')!==originalBinaryHash)throw Error('Binary preservation failed');
 manifest.assets.push({source:id+'.glb',output:file,source_sha256:json.asset.extras.avenlab_source_sha256,binary_sha256:originalBinaryHash,unchanged_binary:true,groups:[...groups.keys()].map(k=>k.slice(k.indexOf(':')+1)),source_objects:sourceNodes.length,exported_mesh_primitives:meshes.length});
}
fs.writeFileSync(path.join(output,'road-groups-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
