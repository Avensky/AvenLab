export type WorldShape={x:number;y:number;z:number;w:number;h:number;d:number;yaw:number;color:string};
/** Bounded geometry preview from the same Rust document as both world selectors.
 * These silhouettes are map geometry, not a claim to be final GLB photography. */
export function worldPreviewShapes(value:unknown):WorldShape[]{
 if(!value||typeof value!=='object')return [];
 const doc=value as Record<string,unknown>,layout=doc.authored_layout as {objects?:unknown[]}|undefined;
 if(Array.isArray(layout?.objects))return layout.objects.slice(0,1500).flatMap(raw=>{
  const o=raw as {position?:number[];size?:number[];yaw?:number;color?:string;piece?:string};
  if(!o.position||!o.size||![...o.position,...o.size].every(Number.isFinite))return [];
  return [{x:o.position[0],y:o.position[1],z:o.position[2],w:Math.max(.2,o.size[0]),h:Math.max(.2,o.size[1]),d:Math.max(.2,o.size[2]),yaw:(Number.isFinite(o.yaw)?o.yaw!:0)*Math.PI/180,color:/^#[\da-f]{6}$/i.test(o.color??'')?o.color!:'#718390'}];
 });
 // Schema 2's legacy collider records are Blender XYZ despite Y-up metadata.
 // Match mapDocument.editableBoxes and Rust's conversion exactly once.
 const axis=(doc.coordinate_system as {up_axis?:unknown}|undefined)?.up_axis;
 const zUp=doc.schema_version===2||(typeof axis==='string'&&axis.toLowerCase()==='z');
 return [...(Array.isArray(doc.roads)?doc.roads:[]),...(Array.isArray(doc.buildings)?doc.buildings:[])].slice(0,1500).flatMap(raw=>{
  const o=raw as {pos?:number[];half_extents?:number[];kind?:string};if(!o.pos||!o.half_extents||![...o.pos,...o.half_extents].every(Number.isFinite))return [];
  const p=o.pos,e=o.half_extents;return [{x:p[0],y:zUp?p[2]:p[1],z:zUp?-p[1]:p[2],w:e[0]*2,h:(zUp?e[2]:e[1])*2,d:(zUp?e[1]:e[2])*2,yaw:0,color:o.kind==='road'?'#3b4853':'#9eaaa9'}];
 });
}
export function drawWorldPortrait(canvas:HTMLCanvasElement,shapes:WorldShape[]){
 const c=canvas.getContext('2d');if(!c)return;
 const width=canvas.width,height=canvas.height;c.clearRect(0,0,width,height);
 const sky=c.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#183a55');sky.addColorStop(1,'#79a2b0');c.fillStyle=sky;c.fillRect(0,0,width,height);
 const polygons=shapes.flatMap(o=>{
  const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[o.x+a*o.w/2*Math.cos(o.yaw)-b*o.d/2*Math.sin(o.yaw),o.z+a*o.w/2*Math.sin(o.yaw)+b*o.d/2*Math.cos(o.yaw)]);
  const project=(y:number)=>points.map(([x,z])=>[(x-z)*.78,(x+z)*.33-y*.65]);
  return [{top:project(o.y+o.h),base:project(o.y),order:o.x+o.z,color:o.color}];
 }).sort((a,b)=>a.order-b.order);
 if(!polygons.length)return;
 const all=polygons.flatMap(p=>[...p.top,...p.base]),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
 const minX=Math.min(...xs),minY=Math.min(...ys),spanX=Math.max(1,Math.max(...xs)-minX),spanY=Math.max(1,Math.max(...ys)-minY),scale=Math.min((width-40)/spanX,(height-42)/spanY);
 const tx=(p:number[])=>[(p[0]-minX-spanX/2)*scale+width/2,(p[1]-minY-spanY/2)*scale+height/2];
 const face=(points:number[][],color:string)=>{c.beginPath();points.map(tx).forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();};
 for(const p of polygons){for(let i=0;i<4;i++){const j=(i+1)%4;face([p.top[i],p.top[j],p.base[j],p.base[i]],'#344c5c');}face(p.top,p.color);c.strokeStyle='#c7d9df44';c.lineWidth=.5;c.stroke();}
}
