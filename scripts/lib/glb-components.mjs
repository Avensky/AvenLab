/** Non-destructive component schema. Existing names remain animation aliases. */
export const COMPONENT_SCHEMA=1;
const exact=new Map([
 ['Turret','weapon.turret'],['Cannon','weapon.barrel'],['HEADLIGHT_L','light.head.front_left'],['HEADLIGHT_R','light.head.front_right'],
 ['ROTOR_MAIN','rotor.main'],['ROTOR_TAIL','rotor.tail'],['body','body.paint'],['paint','body.paint'],
]);
export function componentRole(name=''){
 const wheel=/^(WHEEL|SPIN|CALIPER)_(FL|FR|RL|RR)$/.exec(name);
 if(wheel)return `${{WHEEL:'wheel.pivot',SPIN:'wheel.spin',CALIPER:'wheel.caliper'}[wheel[1]]}.${{FL:'front_left',FR:'front_right',RL:'rear_left',RR:'rear_right'}[wheel[2]]}`;
 return exact.get(name)??'unclassified';
}
export function readChunks(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Expected a complete GLB 2 file (not an LFS pointer)');
 const chunks=[];let offset=12;
 while(offset<bytes.length){if(offset+8>bytes.length)throw Error('Truncated chunk');const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(length%4||offset+8+length>bytes.length)throw Error('Invalid chunk length');chunks.push({type,data:bytes.subarray(offset+8,offset+8+length)});offset+=8+length;}
 if(chunks[0]?.type!==0x4e4f534a)throw Error('Missing JSON chunk');return chunks;
}
export function standardizeGlb(bytes,assetId){
 const chunks=readChunks(bytes),doc=JSON.parse(chunks[0].data.toString());
 if(doc.asset?.extras?.avenlab?.schema===COMPONENT_SCHEMA)return {bytes,report:doc.asset.extras.avenlab};
 if(!Array.isArray(doc.nodes)||!Array.isArray(doc.scenes))throw Error('Missing scene hierarchy');
 const components=[],review=[];
 for(const [index,node] of doc.nodes.entries()){
  const role=componentRole(node.name),id=`node_${String(index).padStart(5,'0')}`;
  const metadata={schema:COMPONENT_SCHEMA,id,role,canonicalName:`AL_${role.replaceAll('.','_').toUpperCase()}_${String(index).padStart(5,'0')}`,sourceName:node.name??null};
  node.extras={...node.extras,avenlab:metadata};
  if(!node.name)node.name=metadata.canonicalName;
  components.push({node:index,...metadata});
  if(role==='unclassified'&&node.mesh!==undefined)review.push(index);
 }
 // One identity root per scene; original node indices, pivots, skin joints,
 // animation channels and hierarchy below the scene roots remain unchanged.
 for(const [index,scene] of doc.scenes.entries()){
  const root=doc.nodes.length;doc.nodes.push({name:`AL_ASSET_${index}`,children:scene.nodes??[],extras:{avenlab:{schema:COMPONENT_SCHEMA,role:'asset',id:`scene_${index}`}}});scene.nodes=[root];
 }
 for(const [index,material] of (doc.materials??[]).entries()){
  material.extras={...material.extras,avenlab:{schema:COMPONENT_SCHEMA,id:`material_${index}`,sourceName:material.name??null,role:'unclassified'}};
  if(!material.name)material.name=`AL_MATERIAL_${String(index).padStart(5,'0')}`;
 }
 const report={schema:COMPONENT_SCHEMA,assetId,components,review};
 doc.asset.extras={...doc.asset.extras,avenlab:report};
 const json=Buffer.from(JSON.stringify(doc)),padding=Buffer.alloc((4-json.length%4)%4,32);
 chunks[0]={type:0x4e4f534a,data:Buffer.concat([json,padding])};
 const body=chunks.map(({type,data})=>{const header=Buffer.alloc(8);header.writeUInt32LE(data.length);header.writeUInt32LE(type,4);return Buffer.concat([header,data]);});
 const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+body.reduce((sum,b)=>sum+b.length,0),8);
 return {bytes:Buffer.concat([header,...body]),report};
}
