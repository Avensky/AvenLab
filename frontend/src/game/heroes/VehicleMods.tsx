import {useCallback,useEffect,useMemo,type ReactNode} from 'react';
import catalog from '../../../../avenlab-server/src/assets/vehicle-mods.json';
import type {VehiclePerformanceSummary} from './VehicleStudio';
const names:Record<string,string>={engine_force:'Engine force',max_speed:'Speed cap',mu_base:'Tire grip',brake_force:'Braking',mass:'Mass',suspension_damping_ratio:'Suspension damping'};
export function VehicleMods({vehicle,stages,onStagesChange,onSummaryChange,onFooterChange}:{vehicle:string;stages:Record<string,number>;onStagesChange:(stages:Record<string,number>)=>void;onSummaryChange?:(summary:VehiclePerformanceSummary)=>void;onFooterChange?:(footer:ReactNode|null)=>void}){
 const effects=useMemo(()=>{const next:Record<string,number>={};for(const [id,part] of Object.entries(catalog))for(const [stat,amount]of Object.entries(part.effects))next[stat]=(next[stat]??1)+amount*(stages[id]??0);return next;},[stages]);
 const summary=useMemo(()=>({engine_force:effects.engine_force??1,max_speed:effects.max_speed??1,mu_base:effects.mu_base??1,brake_force:effects.brake_force??1}),[effects]);
 const restore=useCallback(()=>onStagesChange({}),[onStagesChange]);
 const exportBuild=useCallback(()=>{const blob=new Blob([JSON.stringify({vehicle,tuning:{mod_stages:stages}},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=vehicle+'-mods.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},[vehicle,stages]);
 useEffect(()=>{onSummaryChange?.(summary);},[summary,onSummaryChange]);
 useEffect(()=>{onFooterChange?.(<><button type="button" onClick={restore}>RESTORE STOCK</button><button type="button" onClick={exportBuild}>EXPORT BUILD</button></>);return()=>onFooterChange?.(null);},[onFooterChange,restore,exportBuild]);
 return <section className="vehicle-studio-card vehicle-performance-page" aria-label="Performance modifications">
  <header><small>BUILD PREVIEW · STOCK = 100%</small><h3>Performance parts</h3></header>
  <p>Choose a stage to compare fictional upgrades. This preview does not install or save tuning to the server.</p>
  {Object.entries(catalog).map(([id,part])=><label key={id}>{part.label}<select aria-label={part.label} value={stages[id]??0} onChange={e=>onStagesChange({...stages,[id]:Number(e.target.value)})}>{['Stock','Street · Stage 1','Sport · Stage 2','Race · Stage 3'].map((label,i)=><option key={i} value={i}>{label}</option>)}</select></label>)}
  <figure className="vehicle-performance-stats" aria-label="Estimated stock-relative performance comparison"><figcaption className="sr-only">Estimated stat comparison, not a measured dyno run</figcaption>{Object.entries(effects).map(([stat,multiplier])=><div className="vehicle-performance-stat" key={stat}><label><span>{names[stat]??stat.replaceAll('_',' ')}</span><strong>{(100*multiplier).toFixed(1)}%</strong><meter min={0} max={1.5} value={Math.max(0,Math.min(1.5,multiplier))} optimum={1}/></label></div>)}</figure>
  <p>Gearing raises the target speed while reducing drive force. A higher speed cap does not guarantee the engine can reach it. NOS effects remain a build estimate.</p>
 </section>;
}
