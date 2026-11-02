import { addPiece } from "../worldBuilder/document/layoutDocument";
import { useState } from "react";
import { useLayoutStore, layoutAction } from "../worldBuilder/state/layoutStore";
import { destructionDefaults, estimatedDamage, type DestructionSettings } from "./destruction";

const roles = [
  { name: "Light assault", weapon: "Twin automatic machine pistols", ability: "Fast pursuit; close-range sustained fire" },
  { name: "Support gunner", weapon: "Turret-mounted machine gun", ability: "Medium speed; covering fire" },
  { name: "Precision medic", weapon: "Six-shot single-fire support weapon", ability: "Ally hit: heal · Enemy hit: damage · Ultimate: temporary vehicle boost" },
];
/** Planning UI only. No projectiles, damage packets or driving input are emitted. */
export function CombatAuthoringPanel() {
  const doc = useLayoutStore(s => s.doc), selected = useLayoutStore(s => s.selected);
  const item = doc?.objects.find(o => o.id === selected);
  const [role, setRole] = useState(0), [aim, setAim] = useState({ x: 0, y: 0 });
  const settings = item?.destruction ?? destructionDefaults;
  const permanent = item?.piece === "coastal-land-bridge" || item?.piece === "coastal-land";
  const update = (patch: Partial<DestructionSettings>) => layoutAction(() => {
    if (item && !item.locked) useLayoutStore.getState().update({ destruction: { ...settings, ...patch, ...(permanent ? { enabled: false } : {}) } });
  });
  return <div className="le-section"><h3>ASSET DAMAGE</h3><button onClick={()=>layoutAction(()=>{if(!doc)return;const spawn=doc.spawns?.[0];if(!spawn)throw Error("Place a spawn first");const a=spawn.yaw*Math.PI/180;const next=addPiece(doc,'wall',[spawn.position[0]-Math.sin(a)*25,spawn.position[1],spawn.position[2]-Math.cos(a)*25],spawn.yaw);const wall=next.objects.at(-1)!;wall.size=[8,3,.5];wall.destruction={...destructionDefaults,enabled:true,hp:100,smallArms:1};useLayoutStore.getState().commit(next,'Practice wall placed 25 m ahead of the first spawn. Apply & Test Drive to load its collider.');useLayoutStore.getState().select(wall.id);})}>ADD PRACTICE WALL</button>
    <p className="le-tip">STRUCTURE TEST · Apply the map, enable Combat Test and aim/fire at the practice wall. Small-arms hits clear explicit standalone structures; rubble and explosions remain pending.</p>
    {item ? <fieldset disabled={item.locked}><legend>{item.name}</legend>
      {permanent && <p>Permanent land / land bridge · indestructible</p>}
      <label><input type="checkbox" disabled={permanent} checked={!permanent && settings.enabled} onChange={e => update({ enabled: e.target.checked })}/> Destructible</label>
      {([['hp','Structural HP',1,1000000,100],['smallArms','Small-arms multiplier',0,10,0.01],['cannon','Cannon multiplier',0,10,0.1],['bomb','Bomb multiplier',0,10,0.1]] as const).map(([key,label,min,max,step]) => <label className="le-title-label" key={key}>{label}<input type="number" min={min} max={max} step={step} value={settings[key]} onChange={e => update({ [key]: Number(e.target.value) })}/></label>)}
      <label>Destroyed footprint (rubble pending; test clears)<select value={settings.rubble} onChange={e => update({ rubble: e.target.value as DestructionSettings['rubble'] })}><option value="clear">Clear route</option><option value="cover">Bounded rubble cover</option></select></label>
      <p>Preview per 100 base damage: small arms {estimatedDamage(settings,'smallArms',100)} · cannon {estimatedDamage(settings,'cannon',100)} · bomb {estimatedDamage(settings,'bomb',100)}</p>
    </fieldset> : <p>Select a building, bridge or prop to author its damage profile.</p>}
    <h3>COMBAT CONTROLS PREVIEW</h3>
    <select aria-label="Combat role preview" value={role} onChange={e => setRole(Number(e.target.value))}>{roles.map((r,i)=><option key={r.name} value={i}>{r.name}</option>)}</select>
    <p>{roles[role].weapon}</p><p>{roles[role].ability}</p>
    <div aria-label="Independent turret aim preview" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const b=e.currentTarget.getBoundingClientRect();setAim({x:Math.max(-180,Math.min(180,(e.clientX-b.left)/b.width*360-180)),y:Math.max(-45,Math.min(45,45-(e.clientY-b.top)/b.height*90))}); }} style={{height:110,position:'relative',border:'1px solid currentColor',touchAction:'none'}}>
      <span style={{position:'absolute',left:`${(aim.x+180)/3.6}%`,top:`${(45-aim.y)/0.9}%`,transform:'translate(-50%,-50%)'}}>＋</span>
    </div><p>Drag to preview aim · yaw {Math.round(aim.x)}° / pitch {Math.round(aim.y)}° · does not steer or fire.</p>
    <p>Desktop: drive with WASD; mouse aims turret. Controller: left stick drives, right stick aims; triggers fire.</p>
    <p>Mobile: left thumb steers; right thumb drags to aim. Separate fire, heal and ultimate buttons. Optional aim assist and automatic acceleration keep two-thumb play manageable. These bindings are planned, not active.</p>
  </div>;
}
