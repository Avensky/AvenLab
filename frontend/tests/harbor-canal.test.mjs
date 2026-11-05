import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {harborCanal} from "../src/worldBuilder/generation/harborCanal.ts";
import {deckPanorama} from "../src/worldBuilder/generation/harborPieces.ts";
import {PresentationDelay} from "../src/hooks/presentationDelay.ts";
import {createServer} from "vite";

test("all dock plans have ten spawns, the surface crossings and viaduct and no hidden water floor",()=>{
  for(const plan of ["red","blue","fleet"]){
    const layout=harborCanal(plan,123).authored_layout;
    assert.equal(layout.ground,false);assert.equal(layout.repeat,false);
    const pieces=layout.objects;
    assert.equal(pieces.filter(o=>o.piece==="big-e-docked").length,plan==="fleet"?2:1);
    for(const ship of pieces.filter(o=>o.piece==="big-e-docked")){
      const {eye,target}=deckPanorama(ship,pieces);
      assert(eye[1]>ship.position[1] && Math.abs(target[0])<Math.abs(eye[0]));
    }
    assert.equal(pieces.filter(o=>o.name==="Permanent causeway").length,1);
    assert.equal(pieces.filter(o=>o.piece==="canal-lift").length,2);
    assert.equal(pieces.filter(o=>o.piece==="canal-breakable"&&o.destruction?.enabled).length,1);
    for(const team of ["red","blue"]){
      const afloat=team===plan||plan==="fleet";
      const stand=pieces.find(o=>o.id==="home-flag-"+team);
      const bay=pieces.find(o=>o.id==="home-gas-"+(team==="red"?"west":"east"));
      assert.equal(!!stand,afloat);
      assert.equal(bay.piece,afloat?"service-center":"fuel-station");
      if (stand) assert(!stand.solid && Math.hypot(stand.position[0]-bay.position[0],stand.position[2]-bay.position[2])>15);
      const pads=layout.spawns.filter(p=>p.team===team);assert.equal(pads.length,5);
      assert(pads.every(p=>p.position[1]===(afloat?6:.08)));
    }
    assert(pieces.filter(o=>o.piece==="coastal-water-visual").every(o=>!o.solid));
    assert.equal(pieces.filter(o=>o.piece==="harbor-seabed" && o.solid && o.position[1]+o.size[1]===-60).length,4);
    assert.equal(pieces.filter(o=>o.id.startsWith("home-gas-")).length,2);
    assert(pieces.filter(o=>o.piece==="highway-guardrail").every(o=>o.destruction?.enabled && o.destruction.hp===5));
    assert(pieces.some(o=>o.id.startsWith("boarding-rail-")));
    assert(pieces.filter(o=>o.name==="Boarding bridge column").every(o=>o.position[1]===-60));
    assert(pieces.some(o=>o.piece==="kit-stone_start") && pieces.some(o=>o.piece==="kit-highway_25_wide_straight_level"));
    assert(pieces.some(o=>o.piece==="highway-guardrail"&&o.yaw%90!==0));
  }
});
test("runtime CVN-65 is one embedded indexed primitive and supplies a measured deck",()=>{
  const b=fs.readFileSync(new URL("../public/models/world/big-e-docked.glb",import.meta.url));
  assert.equal(b.readUInt32LE(8),b.length);
  const model=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  const position = model.accessors[model.meshes[0].primitives[0].attributes.POSITION];
  const objects = harborCanal('fleet',123).authored_layout.objects;
  for (const bank of objects.filter(o => o.piece==='coastal-land')) {
    assert.equal(bank.position[1],-60);
    assert.equal(bank.position[1]+bank.size[1],0);
  }
  for (const ship of objects.filter(o => o.piece==='big-e-docked')) {
    const keel = ship.position[1]+position.min[1]*ship.size[1];
    const floor = Math.max(...objects.filter(o=>o.piece==='harbor-seabed' &&
      Math.abs(ship.position[0]-o.position[0])<=o.size[0]/2 &&
      Math.abs(ship.position[2]-o.position[2])<=o.size[2]/2).map(o=>o.position[1]+o.size[1]));
    assert(Number.isFinite(floor) && keel-floor >= 37, 'each dock has clearance beneath the actual hull');
  }
  assert.equal(model.meshes.length,1);assert.equal(model.meshes[0].primitives.length,1);
  assert.equal(model.accessors[3].count/3,72945+2*(2+15+4));
});
test("late packets cause fewer held frames without reversing render time",async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",logLevel:"error"});
  try{
    const {PhysicsInterpolationBuffer}=await vite.ssrLoadModule("/src/hooks/usePhysicsInterpolator.ts");
    const {charted,harborRoads}=await vite.ssrLoadModule("/src/ui/Minimap/HarborChart.tsx");
    assert.equal(charted("8000000000000001",-399,-399),true);
    assert.equal(charted("8000000000000001",399,399),true);
    assert.equal(charted("8000000000000001",99,99),false);
    const layout=harborCanal("red",7).authored_layout,roads=harborRoads(layout,false);
    assert.equal(roads.length-harborRoads(layout,true).length,1);
    const {surveyPosition,useSurvey,personalChart}=await vite.ssrLoadModule("/src/ui/Minimap/surveyedCells.ts");
    const box={id:"home",kind:"road",center:[10,0,10],half_extents:[2,1,2]};
    const far={...box,id:"far",center:[210,0,10]};
    const stream={map_id:"stream",collider_chunks:[{boxes:[box,far]}]};
    surveyPosition("me:room1",stream,[10,0,10]);
    assert.deepEqual([...useSurvey.getState().cells.values()].map(c=>c.boxes.map(b=>b.id)),[["home"]]);
    surveyPosition("me:room1",stream,[210,0,10]);
    assert.deepEqual([...useSurvey.getState().cells.values()].map(c=>c.boxes.map(b=>b.id)),[["home"],["far"]]);
    surveyPosition("me:room2",stream,[210,0,10]);assert.equal(useSurvey.getState().cells.size,1);
    surveyPosition("me:harbor",{...stream,map_id:"harbor_canal_fleet"},[210,0,10]);
    assert.deepEqual(personalChart(useSurvey.getState().cells,"ffffffffffffffff").map(c=>[c.x,c.z]),[[200,0]],
      "allied exploration cannot reveal an unvisited sector on the full map");
    assert.equal(personalChart(useSurvey.getState().cells,"0000000000000000").length,0);
    const buffer=new PhysicsInterpolationBuffer(), clock=new PresentationDelay();
    const gaps=[30,35,70,20,40,65,20,40], counts=[0,0],prev=[-1,-1];
    let arrival=0,seq=0,delay=50;
    for(let now=0;now<=14000;now+=10){
      while(arrival<=now){
        clock.receipt(arrival);buffer.setSnapshot("v",{id:"v",vehicle_id:"brz",position:[0,0,seq],rotation:[0,0,0,1]},
          {tick:seq*2,simulation_time_s:seq/30,received_at_ms:arrival});arrival+=gaps[seq%gaps.length];seq++;
      }
      delay=clock.sample(now);
      [50,delay].forEach((d,i)=>{
        const z=buffer.getInterpolated("v",d,now).position[2];
        assert(z>=prev[i]);if(now>=2500 && z===prev[i])counts[i]++;
        prev[i]=z;
      });
    }
    console.log("Held samples, fixed/adaptive",counts,"steady reserve",delay);
    assert(counts[0]>0&&counts[1]<counts[0]);
    clock.reset();for(let i=0;i<180;i++){clock.receipt(i*33);clock.sample(i*33);}
    assert(clock.sample(6000)<50);
  }finally{await vite.close();}
});
