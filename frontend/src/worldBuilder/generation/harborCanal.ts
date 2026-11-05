import { parseLayout, pieceById, type WorldLayout, type LayoutObject, type V3 } from "../document/layoutDocument.ts";
import {mapExport,parseMapText,type MapDocument} from "../document/mapDocument.ts";
import {CARRIER,LIFT,guardrail} from "./harborPieces.ts";

export type DockPlan = "red" | "blue" | "fleet";
export function harborCanal(plan:DockPlan,seed:number):MapDocument {
  const id="harbor_canal_"+plan, objects:LayoutObject[]=[];
  let state=seed>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const add=(piece:string,name:string,position:V3,size:V3,color:string,solid=true,yaw=0):LayoutObject=>{
    const template=pieceById(piece);
    const item:LayoutObject={id:"harbor-"+(objects.length+1),name,piece,position,size,color,solid,yaw,locked:false,
      parts:template?structuredClone(template.parts):[{shape:"box",position:[0,.5,0],size:[1,1,1]}]};
    objects.push(item);return item;
  };
  // One continuous navigable channel. No ground or collision plane spans water.
  for(const x of [-180,180])for(const z of [-170,170])
    add("coastal-water-visual","Sea and canal",[x,-8,z],[360,.05,340],"#234957",false);
  for(const side of [-1,1]){
    for(const z of [-150,150])
      add("coastal-land","City bank",[side*108,-10,z],[168,10,300],"#536069");
    for(const x of [54,148]){
      for(const z of [-150,150])add("coastal-road","Quayside avenue",[side*x,0,z],[15,.08,300],"#333b40");
    }
    for(const z of [-178,0,178]){
      const road=add("coastal-road","Crossing approach",[side*108,.01,z],[168,.08,16],"#32393f");
      for(const offset of [-.42,-.28,-.14,0,.14,.28,.42])road.parts.push({shape:"box",
        position:[offset,1.25,0],size:[.045,.1,.009],color:"#b7b395",solid:false});
    }
    for(const x of [84,119,170])for(const z of [-254,-220,-112,-74,74,112,220,254]){
      const height=8+Math.floor(random()*7)*4;
      const block=add("coastal-building","Dockside block",[side*x,0,z],[15,height,22],random()<.5?"#79818a":"#907d71");
      // Continuous ribbon windows and piers share the static box batch. The
      // building shell alone owns collision; the trim adds no Rapier shapes.
      const floors=Math.round(height/4);
      for(let f=0;f<floors;f++)block.parts.push({shape:"box",position:[0,(f+.56)/floors,0],
        size:[1.004,.43/floors,1.004],color:"#415763",solid:false});
      for(const offset of [-.36,0,.36]){
        block.parts.push({shape:"box",position:[offset,.5,0],size:[.026,1,1.008],color:"#7a8286",solid:false},
          {shape:"box",position:[0,.5,offset],size:[1.008,1,.022],color:"#7a8286",solid:false});
      }
      block.parts.push({shape:"box",position:[0,1,0],size:[1.025,.025,1.025],color:"#737c80",solid:false});
    }
    // Straight canal rail with three clear openings, plus curved end returns.
    const rail=(x1:number,z1:number,x2:number,z2:number)=>{
      objects.push(guardrail("harbor-"+(objects.length+1),x1,z1,x2,z2,.08));
    };
    for(const [from,to] of [[-285,-188],[-168,-10],[10,168],[188,285]]){
      const count=Math.ceil((to-from)/24);
      for(let n=0;n<count;n++)rail(side*26,from+(to-from)*n/count,side*26,from+(to-from)*(n+1)/count);
    }
    // Rails around the seaward perimeter leave the boarding apron open.
    for(const [from,to] of [[-294,-12],[12,294]]) {
      const count=Math.ceil((to-from)/24);
      for(let i=0;i<count;i++)rail(side*190,from+i*(to-from)/count,side*190,from+(i+1)*(to-from)/count);
    }
    for(const end of [-1,1]){
      for(let i=0;i<7;i++)rail(side*(38+i*152/7),end*297,side*(38+(i+1)*152/7),end*297);
      for(let n=0;n<5;n++){
        const point=(i:number)=>[side*(26+12*(1-Math.cos(i*Math.PI/10))),end*(285+12*Math.sin(i*Math.PI/10))];
        const a=point(n),b=point(n+1);rail(a[0],a[1],b[0],b[1]);
      }
    }
  }
  // The causeway cap and piers leave two submerged culverts open to the sea.
  add("coastal-land-bridge","Permanent causeway",[0,-1.1,-178],[48,1.18,16],"#7c8585");
  for(const x of [-22,0,22])add("coastal-land-bridge","Culvert pier",[x,-11,-178],[4,10,16],"#687375");
  // Each leaf pivots about its bank. Both are level when closed.
  for(const side of [-1,1]){
    const leaf=add(LIFT,"Drawbridge jump leaf",[24*side,0,0],[24,.6,16],"#8e969a",true,side<0?0:180);
    leaf.parts=[{shape:"box",position:[.5,-.5,0],size:[1,1,1]}];
  }
  const breakable=add("canal-breakable","Demolition crossing",[0,-.6,178],[48,.68,16],"#a29385");
  breakable.destruction={enabled:true,hp:280,smallArms:.2,cannon:1,bomb:1.5,rubble:"clear"};
  const spawns:WorldLayout["spawns"]=[];
  for(const [team,side] of [["red",-1],["blue",1]] as const){
    const afloat=plan==="fleet"||plan===team;
    const cx=side*256;
    if(afloat){
      add(CARRIER,team+" docked Big E",[cx,6,0],[...pieceById(CARRIER)!.size],"#63747c").id="carrier-"+team;
      const ramp=add("coastal-ramp","Quay to flight deck",[side*205.5,.08,0],[16,5.92,27],"#7f898c",true,-side*90);
      ramp.parts=[{shape:"wedge",position:[0,.5,0],size:[1,1,1]}];
      add("coastal-pier","Boarding pier",[side*232,5.4,0],[26,.6,16],"#68757c");
    }
    for(let n=0;n<5;n++)spawns.push({id:"spawn-"+team+"-"+n,team,yaw:side<0?90:-90,
      position:[afloat?cx:side*54,afloat?6:.08,(afloat?-62:178)+(n-2)*8]});
    const sites=["fuel-station","repair-shop"] as const;
    const flip=random()<.5?-1:1;
    sites.forEach((piece,i)=>{const template=pieceById(piece)!;
      add(piece,template.label,[side*95,.08,(i===0?-1:1)*flip*145],[...template.size],template.color);});
  }
  const layout=parseLayout({format:"avenlab-world-layout",version:1,map_id:id,title:"Harbor Canal · "+plan+" · "+seed,
    base:"replace",ground:false,repeat:false,spawns,objects});
  return parseMapText(mapExport({schema_version:2,map_id:id,sky:"foggy_day",
    coordinate_system:{units:"meters",up_axis:"y",forward_axis:"-z"},cell:[800,800],surface:{road_y:0},
    layout:{kind:"fixed_grid",origin:[0,0],size:[1,1]},visuals:[{id:"base",asset:"/models/world/garage.glb",position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]}],
    metadata:{name:"Harbor Canal · "+plan,description:"Two banks, three crossings and a docked carrier."},
    roads:[],buildings:[],authored_layout:layout}));
}
