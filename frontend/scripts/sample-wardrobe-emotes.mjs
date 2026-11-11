import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { Group, Object3D, Vector3, Matrix4, AnimationMixer, LoopOnce } from 'three';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: sample-wardrobe-emotes.mjs source.glb output.json');
const bytes = await readFile(input), gltf = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const root = new Group(); root.name='garage-villager-female';
const nodes = gltf.nodes.map(node => {
 const o = new Object3D(); o.name=node.name ?? '';
 if(node.matrix)new Matrix4().fromArray(node.matrix).decompose(o.position,o.quaternion,o.scale);
 else {if(node.translation)o.position.fromArray(node.translation);if(node.rotation)o.quaternion.fromArray(node.rotation);if(node.scale)o.scale.fromArray(node.scale);}
 return o;
});
gltf.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
gltf.scenes[gltf.scene??0].nodes.forEach(i=>root.add(nodes[i]));root.updateMatrixWorld(true);
const joints=gltf.skins[0].joints.map(i=>nodes[i]), inverse=joints.map(j=>j.matrixWorld.clone().invert());
const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
try {
 const {driverArm,aimDriverJoint,EMOTE_GROUPS,emoteCollection,buildEmoteClips}=await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
 for(const side of ['l','r']) {
  const {shoulder,elbow,hand}=driverArm(root,side), sign=Math.sign(elbow.getWorldPosition(new Vector3()).x-shoulder.getWorldPosition(new Vector3()).x);
  aimDriverJoint(shoulder,elbow,new Vector3(sign*.43,-1,-.06));
  aimDriverJoint(elbow,hand,side==='r'?new Vector3(-sign*.62,.36,.72):new Vector3(sign*.12,-.83,.56));
 }
 root.updateMatrixWorld(true);
 const poses=[],mixer=new AnimationMixer(root);
 const capture=(name,time)=>{
  root.updateMatrixWorld(true);
  poses.push({name,time,matrices:joints.map((j,i)=>j.matrixWorld.clone().multiply(inverse[i]).elements.map(v=>+v.toFixed(8)))});
 };
 capture('idle',0);
 const emotes=[...new Map(EMOTE_GROUPS.flatMap(g=>emoteCollection(g,false)).map(e=>[e.id,e])).values()];
 for(const emote of emotes){
  const [clip]=buildEmoteClips(root,[emote]);
  const action=mixer.clipAction(clip).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
  const phases=[...new Set([0,...emote.keys.map(k=>k[0]),1])].sort((a,b)=>a-b);
  const samples=phases.flatMap((p,i)=>i?[p,(p+phases[i-1])/2]:[p]).sort((a,b)=>a-b);
  for(const p of samples){mixer.setTime(p*clip.duration);capture(emote.id,p);}
  action.stop();mixer.uncacheClip(clip);
 }
 await writeFile(output,JSON.stringify({source:input,bones:joints.map(j=>j.name),emoteCount:emotes.length,poses}));
 console.log(JSON.stringify({emotes:emotes.length,samples:poses.length,output}));
}finally{await vite.close();}
