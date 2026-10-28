import type {DebugAabbBox} from '../store/networkStore';
export type Point={x:number;z:number};
export type Road=Point&{hx:number;hz:number;horizontal:boolean};
export type RoadGraph={roads:Road[];links:{to:number;via:Point[];cost:number}[][]};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const inside=(p:Point,r:Road)=>Math.abs(p.x-r.x)<=r.hx+3&&Math.abs(p.z-r.z)<=r.hz+3;
export function buildRoadGraph(boxes:DebugAabbBox[]):RoadGraph {
 const seen=new Set<string>(),roads:Road[]=[];
 for(const box of boxes){if(!['road','intersection'].includes(box.kind)||!box.center?.every(Number.isFinite)||!box.half_extents?.every(Number.isFinite))continue;
  const [x,,z]=box.center,[hx,,hz]=box.half_extents;if(hx<=0||hz<=0)continue;const key=[x,z,hx,hz].map(v=>v.toFixed(1)).join(',');if(seen.has(key))continue;seen.add(key);roads.push({x,z,hx,hz,horizontal:hx>=hz});if(roads.length===1024)break;
 }
 const links:RoadGraph['links']=roads.map(()=>[]),order=roads.map((r,i)=>({i,min:r.x-r.hx})).sort((a,b)=>a.min-b.min);
 for(let k=0;k<order.length;k++){const i=order[k].i,a=roads[i];for(let n=k+1;n<order.length&&order[n].min<=a.x+a.hx+3;n++){
  const j=order[n].i,b=roads[j];if(Math.abs(a.z-b.z)>a.hz+b.hz+3)continue;
  let via:Point[];
  if(a.horizontal!==b.horizontal){const p={x:a.horizontal?b.x:a.x,z:a.horizontal?a.z:b.z};if(!inside(p,a)||!inside(p,b))continue;via=[p];}
  else if(a.horizontal){const x=(Math.max(a.x-a.hx,b.x-b.hx)+Math.min(a.x+a.hx,b.x+b.hx))/2;via=[{x,z:a.z},{x,z:b.z}];}
  else {const z=(Math.max(a.z-a.hz,b.z-b.hz)+Math.min(a.z+a.hz,b.z+b.hz))/2;via=[{x:a.x,z},{x:b.x,z}];}
  const points=[a,...via,b],cost=points.slice(1).reduce((sum,p,id)=>sum+distance(points[id],p),0);links[i].push({to:j,via,cost});links[j].push({to:i,via:[...via].reverse(),cost});
 }}return {roads,links};
}
export function nearestRoad(graph:RoadGraph,p:Point) {
 let best:{index:number;point:Point;distance:number}|null=null;
 graph.roads.forEach((r,index)=>{const point=r.horizontal?{x:Math.max(r.x-r.hx,Math.min(r.x+r.hx,p.x)),z:r.z}:{x:r.x,z:Math.max(r.z-r.hz,Math.min(r.z+r.hz,p.z))};const d=distance(p,point);if(!best||d<best.distance)best={index,point,distance:d};});return best as {index:number;point:Point;distance:number}|null;
}
export function roadRoute(graph:RoadGraph,start:number,end:number):Point[]|null {
 if(!graph.roads[start]||!graph.roads[end])return null;if(start===end)return [];
 const cost=new Float64Array(graph.roads.length).fill(Infinity),parent=new Int32Array(graph.roads.length).fill(-1),open=new Set([start]),closed=new Set<number>();cost[start]=0;
 while(open.size){let current=-1,score=Infinity;for(const id of open){const f=cost[id]+distance(graph.roads[id],graph.roads[end]);if(f<score){score=f;current=id;}}
  if(current===end){const ids=[end];while(ids.at(-1)!==start)ids.push(parent[ids.at(-1)!]);ids.reverse();return ids.slice(1).flatMap((id,k)=>graph.links[ids[k]].find(edge=>edge.to===id)!.via);}
  open.delete(current);closed.add(current);for(const edge of graph.links[current]){if(closed.has(edge.to))continue;const next=cost[current]+edge.cost;if(next<cost[edge.to]){cost[edge.to]=next;parent[edge.to]=current;open.add(edge.to);}}
 }return null;
}
export function pathDistance(points:Point[]){return points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);}
