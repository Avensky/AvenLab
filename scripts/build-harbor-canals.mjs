import fs from "node:fs";
import {guardrail} from "../frontend/src/worldBuilder/generation/harborPieces.ts";
import {harborCanal} from "../frontend/src/worldBuilder/generation/harborCanal.ts";
import {mapExport} from "../frontend/src/worldBuilder/document/mapDocument.ts";
for(const [i,plan] of ["red","blue","fleet"].entries()){
  const world=harborCanal(plan,417+i*613),text=mapExport(world);
  const path=new URL("../avenlab-server/src/assets/blocks/"+world.map_id+"_colliders.json",import.meta.url);
  if(process.argv.includes("--check")){if(fs.readFileSync(path,"utf8")!==text)throw Error("Stale "+world.map_id);}
  else fs.writeFileSync(path,text);
}

// Endless City keeps its original streets and its eastern pier entrance.
const cityPath=new URL("../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json",import.meta.url);
const city=JSON.parse(fs.readFileSync(cityPath,"utf8")),layout=city.authored_layout;
layout.objects=layout.objects.filter(o=>!o.id.startsWith("perimeter-rail-"));
let serial=0;
function line(x1,z1,x2,z2){
  const dx=x2-x1,dz=z2-z1,n=Math.ceil(Math.hypot(dx,dz)/34);
  for(let i=0;i<n;i++)layout.objects.push(guardrail("perimeter-rail-"+(++serial),x1+dx*i/n,z1+dz*i/n,x1+dx*(i+1)/n,z1+dz*(i+1)/n,city.surface.road_y));
}
const [width,depth]=city.cell,[nx,nz]=city.layout.size;
const west=-width/2+1.5,east=(nx-.5)*width-1.5,north=-depth/2+1.5,south=(nz-.5)*depth-1.5;
line(west,north,west,south);line(west,north,east,north);line(west,south,east,south);
line(east,north,east,depth-11);line(east,depth+11,east,south);
const text=JSON.stringify(city,null,2)+"\n";
if(process.argv.includes("--check")){if(fs.readFileSync(cityPath,"utf8")!==text)throw Error("Stale city perimeter");}
else fs.writeFileSync(cityPath,text);
