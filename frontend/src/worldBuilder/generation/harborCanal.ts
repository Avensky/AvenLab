import {coastalTerrain} from './coastalTerrain.ts';
import {dressHarbor} from './harborStreet.ts';
import {fitHarborShortcut} from './harborShortcut.ts';
import { parseLayout, pieceById, type WorldLayout, type LayoutObject, type V3 } from "../document/layoutDocument.ts";
import {mapExport,parseMapText,type MapDocument} from "../document/mapDocument.ts";
import {outfitHarbor} from "./harborOutfit.ts";
import {CARRIER,DESTROYER,LIFT,guardrailRun} from "./harborPieces.ts";
import {burkeHarborKeel} from "./burkeDeck.ts";

export type DockPlan = "red" | "blue" | "fleet";
export function harborCanal(plan:DockPlan,seed:number):MapDocument {
  const id="harbor_canal_"+plan, objects:LayoutObject[]=[];
  let state=seed>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const add=(piece:string,name:string,position:V3,size:V3,color:string,solid=true,yaw=0):LayoutObject=>{
    const template=pieceById(piece);
    const item:LayoutObject={id:"harbor-"+(objects.length+1),name,piece,position,size,color,solid,yaw,locked:false,
      ...(template?.model?{model:structuredClone(template.model)}:{}),
      parts:template?structuredClone(template.parts):[{shape:"box",position:[0,.5,0],size:[1,1,1]}]};
    objects.push(item);return item;
  };
  // Queue new placements separately so established harbor IDs (especially the demolition
  // crossing and its saved damage) keep their original numbering.
  const additions: LayoutObject[] = [];
  // A 64 m navigation channel, rather than the former 48 m slot. Both bridge
  // decks cross it; guardrails remain independent from their wider road decks.
  const canalHalf = 32, railX = canalHalf + 2;
  const permanentZ = -194, demolitionZ = -permanentZ, roadHeight = .09;
  const crossingWidth = 20, escortZ = (demolitionZ / 2);
  const kitPiece = (key:string,name:string,position:V3,yaw:number,id:string):LayoutObject => {
    const piece=pieceById("kit-"+key)!;
    return {id,name,piece:piece.id,position,yaw,size:[...piece.size],color:piece.color,
      solid:true,locked:false,parts:[]};
  };
  // One continuous navigable channel. No ground or collision plane spans water.
  for(const x of [-180,180])for(const z of [-170,170])
    add("coastal-water-visual","Sea and canal",[x,-8,z],[360,.05,340],"#234957",false);
  for(const side of [-1,1]){
    for(const z of [-150,150])
      add("coastal-land","City bank",[side*116,-10,z],[168,10,300],"#536069");
    for(const x of [54,148]){
      for(const z of [-150,150])add("coastal-road","Quayside avenue",[side*x,0,z],[20,.08,300],"#333b40");
    }
    for(const z of [permanentZ,0,demolitionZ]){
      const permanent=z===permanentZ;
      const road=add("coastal-road","Crossing approach",[side*(permanent?172.5:116),.01,z],[permanent?55:168,.08,crossingWidth],"#32393f");
      if (permanent) {
        // Keep both avenue intersections open. The 72 m module starts beyond the inner
        // junction and ends before the outer one. Its inlet, not its center, is the pivot.
        const sideId=side<0?"west":"east";
        additions.push({...road,id:"kit-link-"+sideId,position:[side*49.5,.01,z],size:[35,.08,crossingWidth],parts:structuredClone(road.parts)});
        additions.push(kitPiece("highway_25_wide_straight_level","Highway bridge approach",
          [side*73,roadHeight,z],side<0?180:0,"kit-approach-"+sideId));
      }
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
      const id="harbor-"+(objects.length+1);
      const panels=guardrailRun(id,x1,z1,x2,z2,.08);
      panels[0].id=id; // Retain the original ID for the first panel.
      objects.push(panels[0]);
      additions.push(...panels.slice(1));
    };
    for(const [from,to] of [[-285,permanentZ-14],[permanentZ+14,-14],[14,demolitionZ-14],[demolitionZ+14,285]]){
      const count=Math.ceil((to-from)/24);
      for(let n=0;n<count;n++)rail(side*railX,from+(to-from)*n/count,side*railX,from+(to-from)*(n+1)/count);
    }
    // Rails around the seaward perimeter leave the boarding apron open.
    for(const [from,to] of [[-294,-12],[12,294]]) {
      const count=Math.ceil((to-from)/24);
      for(let i=0;i<count;i++)rail(side*190,from+i*(to-from)/count,side*190,from+(i+1)*(to-from)/count);
    }
    for(const end of [-1,1]){
      for(let i=0;i<7;i++)rail(side*(railX+12+i*144/7),end*297,side*(railX+12+(i+1)*144/7),end*297);
      for(let n=0;n<5;n++){
        const point=(i:number)=>[side*(railX+12*(1-Math.cos(i*Math.PI/10))),end*(285+12*Math.sin(i*Math.PI/10))];
        const a=point(n),b=point(n+1);rail(a[0],a[1],b[0],b[1]);
      }
    }
  }
  // Two native 30 m masonry spans are lengthened to 32 m between measured
  // sockets so the full 64 m water crossing has no hidden four-metre gap.
  // Their deck colliders stay separate from the breakable approach railings.
  // Local -Z points east at this yaw. Keep the centerline open above and below deck.
  const masonry=(key:string,name:string,x:number)=>{
    const item=kitPiece(key,name,[x,roadHeight,permanentZ],-90,"harbor-"+(objects.length+1));
    objects.push(item);return item;
  };
  masonry("stone_start","Permanent causeway",-32).size[2]*=32/30;
  masonry("stone_pedestal_large","West bridge abutment",-32);
  masonry("stone_pedestal_small","Central stone pier",0);
  masonry("stone_pedestal_large","East bridge abutment",32);
  const eastSpan=kitPiece("stone_end","Permanent stone span",[0,roadHeight,permanentZ],-90,"kit-east-span");
  eastSpan.size[2]*=32/30;
  additions.push(eastSpan);
  // Each leaf pivots about its bank. Both are level when closed.
  for(const side of [-1,1]){
    const leaf=add(LIFT,"Drawbridge jump leaf",[canalHalf*side,0,0],[canalHalf,.6,crossingWidth],"#8e969a",true,side<0?0:180);
    leaf.destruction={enabled:true,hp:320,smallArms:.08,cannon:1,bomb:1.5,rubble:"clear"};
    leaf.parts=[{shape:"box",position:[.5,-.5,0],size:[1,1,1]}];
  }
  const breakable=add("canal-breakable","Demolition crossing",[0,-.6,demolitionZ],[canalHalf*2,.68,crossingWidth],"#a29385");
  breakable.destruction={enabled:true,hp:280,smallArms:.2,cannon:1,bomb:1.5,rubble:"clear"};
  const spawns:WorldLayout["spawns"]=[];
  for(const [team,side] of [["red",-1],["blue",1]] as const){
    const afloat=plan==="fleet"||plan===team;
    const cx=side*256;
    if(afloat){
      add(CARRIER,team+" docked Big E",[cx,6,0],[...pieceById(CARRIER)!.size],"#63747c").id="carrier-"+team;
      // Each 154 m escort gets its own long berth between crossings, centered
      // in the canal instead of 70 m behind the carrier on the open-ocean side.
      const berthZ=side*escortZ;
      add(DESTROYER,team+" Arleigh Burke escort",[0,burkeHarborKeel,berthZ],
        [...pieceById(DESTROYER)!.size],"#52626b",true,side<0?0:180).id="destroyer-"+team;
      const ramp=add("coastal-ramp","Quay to flight deck",[side*205.5,.08,0],[16,5.92,27],"#7f898c",true,-side*90);
      ramp.parts=[{shape:"deck",position:[0,.5,0],size:[1,1,1]}];
      add("coastal-pier","Boarding pier",[side*232,5.4,0],[26,.6,16],"#68757c");
      // A separate short canal-bank boarding slope reaches the aft helipad.
      // Its outside edge is at x=32 on the shore; the low edge meets the hull.
      const padZ=berthZ-side*62;
      const gangway=add("coastal-ramp","Canal-to-destroyer boarding gangway",
        [side*21,-3.86,padZ],[7,3.86,22],"#85949b",true,-side*90);
      gangway.parts=[{shape:"deck",position:[0,.5,0],size:[1,1,1]}];
      for(const edge of [-1,1])additions.push(...guardrailRun(
        `canal-boarding-${team}-${edge}`,side*32,padZ+edge*3.35,
        side*10,padZ+edge*3.35,-1.93,-3.86));
    }
    for(let n=0;n<5;n++)spawns.push({id:"spawn-"+team+"-"+n,team,yaw:side<0?90:-90,
      position:[afloat?cx:side*54,afloat?6:.08,(afloat?-62:178)+(n-2)*8]});
    const sites=["fuel-station","repair-shop"] as const;
    const flip=random()<.5?-1:1;
    sites.forEach((piece,i)=>{const template=pieceById(piece)!;
      add(piece,template.label,[side*95,.08,(i===0?-1:1)*flip*145],[...template.size],template.color);});
  }
  objects.push(...additions);
  outfitHarbor(objects);
  for (const side of [-1,1]) fitHarborShortcut(objects,side);
  dressHarbor(objects);
  coastalTerrain(objects);
  const layout=parseLayout({format:"avenlab-world-layout",version:1,map_id:id,title:"Harbor Canal · "+plan+" · "+seed,
    base:"replace",ground:false,repeat:false,spawns,objects});
  return parseMapText(mapExport({schema_version:2,map_id:id,sky:"foggy_day",
    quickplay:{objective:"ctf"},
    coordinate_system:{units:"meters",up_axis:"y",forward_axis:"-z"},cell:[800,800],surface:{road_y:0},
    layout:{kind:"fixed_grid",origin:[0,0],size:[1,1]},visuals:[{id:"base",asset:"/models/world/garage.glb",position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]}],
    metadata:{name:"Harbor Canal · "+plan,description:"Wider canal, three strategic crossings, independent breakaway guardrails and docked fleet."},
    roads:[],buildings:[],authored_layout:layout}));
}
