import type {ReactNode} from "react";

export const VEHICLE_STUDIO_TABS=[
 {id:"performance",label:"PERFORMANCE",description:"Power and handling"},
 {id:"paint",label:"PAINT & FINISH",description:"Color and surface"},
 {id:"body",label:"BODY",description:"Doors and panels"},
 {id:"lighting",label:"LIGHTING",description:"Stalks and hazards"},
 {id:"studio",label:"STUDIO",description:"Portrait capture"},
] as const;
export type VehicleStudioTab=typeof VEHICLE_STUDIO_TABS[number]["id"];
export type VehiclePerformanceSummary={engine_force:number;max_speed:number;mu_base:number;brake_force:number};
export const STOCK_VEHICLE_SUMMARY:VehiclePerformanceSummary={engine_force:1,max_speed:1,mu_base:1,brake_force:1};

export function VehicleStudio({name,role,note,stats,summary=STOCK_VEHICLE_SUMMARY,tab,onTab,footer,children}:{
 name:string;role:string;note:string;stats:{armor:number;speed:number;handling:number;support:number};summary?:VehiclePerformanceSummary;
 tab:VehicleStudioTab;onTab:(tab:VehicleStudioTab)=>void;footer?:ReactNode;children:ReactNode;
}){
 const rows:[[string,number,string],[string,number,string],[string,number,string],[string,number,string]]=[
  ["POWER",summary.engine_force,"engine_force"],["HIGH SPEED",summary.max_speed,"max_speed"],["TIRE GRIP",summary.mu_base,"mu_base"],["BRAKING",summary.brake_force,"brake_force"],
 ];
 const selected=VEHICLE_STUDIO_TABS.find(item=>item.id===tab)!;
 return <div className="vehicle-studio">
  <nav className="vehicle-studio-tabs" role="tablist" aria-label="Vehicle studio sections">
   {VEHICLE_STUDIO_TABS.map(item=><button key={item.id} type="button" role="tab" id={`vehicle-studio-tab-${item.id}`} aria-selected={tab===item.id} aria-controls="vehicle-studio-tab-panel" className="vehicle-studio-tab" onClick={()=>onTab(item.id)}><span>{item.label}</span><small>{item.description}</small></button>)}
  </nav>
  <div className="vehicle-studio-main">
   <aside className="vehicle-studio-details" aria-label="Vehicle power and details">
    <header><small>{role.toUpperCase()} · VEHICLE DETAILS</small><h2>{name}</h2><p>{note}</p></header>
    <section className="vehicle-studio-power"><h3>POWER & PERFORMANCE</h3>{rows.map(([label,value,key])=><div className="vehicle-studio-stat" key={key}><div><span>{label}</span><strong>{Math.round(value*100)}%</strong></div><meter min={0} max={1.5} value={Math.max(0,Math.min(1.5,value))} optimum={1} aria-label={`${label} relative to stock`}/></div>)}</section>
    <section className="vehicle-studio-class-stats" aria-label="Vehicle class ratings"><h3>CLASS PROFILE</h3>{([['ARMOR',stats.armor],['SPEED',stats.speed],['HANDLING',stats.handling],['SUPPORT',stats.support]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
   </aside>
   <section className="vehicle-studio-panel" role="tabpanel" id="vehicle-studio-tab-panel" aria-labelledby={`vehicle-studio-tab-${tab}`}>
    <header className="vehicle-studio-panel-heading"><small>{selected.description.toUpperCase()}</small><h2>{selected.label}</h2></header>
    <div className="vehicle-studio-panel-content">{children}</div>
   </section>
  </div>
  <footer className="vehicle-studio-dock"><small>{selected.label} OPTIONS</small><div className="vehicle-studio-dock-actions">{footer??<span>{selected.description}</span>}</div></footer>
 </div>;
}
