import {useState} from 'react';
import catalog from '../../../../avenlab-server/src/assets/vehicle-mods.json';
const names:Record<string,string>={engine_force:'Engine force',max_speed:'Speed cap',mu_base:'Tire grip',brake_force:'Braking',mass:'Mass',suspension_damping_ratio:'Suspension damping'};
export function VehicleMods({vehicle}:{vehicle:string}){
 const [stages,setStages]=useState<Record<string,number>>({});
 const effects:Record<string,number>={};
 for(const [id,part] of Object.entries(catalog))for(const [stat,amount]of Object.entries(part.effects))effects[stat]=(effects[stat]??1)+amount*(stages[id]??0);
 const exportBuild=()=>{const blob=new Blob([JSON.stringify({vehicle,tuning:{mod_stages:stages}},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=vehicle+'-mods.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="hero-ability-card hero-style-section" aria-label="Performance modifications"><header><div><small>STREET WORKSHOP</small><h3>Performance parts</h3></div></header>
 <p>Build preview · stock = 100%. These fictional stages are not installed or saved to your player yet.</p>
 {Object.entries(catalog).map(([id,part])=><label key={id}>{part.label}<select aria-label={part.label} value={stages[id]??0} onChange={e=>setStages(s=>({...s,[id]:Number(e.target.value)}))}>{['Stock','Street · Stage 1','Sport · Stage 2','Race · Stage 3'].map((label,i)=><option key={i} value={i}>{label}</option>)}</select></label>)}
 <figure aria-label="Estimated stock-relative performance comparison"><figcaption>Estimated stat comparison — not a measured dyno run</figcaption>{Object.entries(effects).map(([stat,multiplier])=><div key={stat}><label>{names[stat]} · {(100*multiplier).toFixed(1)}%<meter min={0} max={1.5} value={multiplier} optimum={1}/></label></div>)}</figure>
 <p>Gearing increases the speed cap while reducing drive force. A higher speed cap does not guarantee that the engine can reach it.</p>
 <button className="menu-control" onClick={()=>setStages({})}>RESTORE STOCK BUILD</button><button className="menu-control" onClick={exportBuild}>EXPORT BUILD JSON</button>
 <p>Body access and equipment: hood/engine, doors, trunk and nitrous mounting require verified model pivots. Nitrous activation, engine visuals and exhaust audio are not connected yet.</p>
 </section>;
}
