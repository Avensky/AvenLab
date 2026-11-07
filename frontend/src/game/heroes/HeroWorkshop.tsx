import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from "react";
import {VehicleMods} from "./VehicleMods";
import {openHeroGuide} from "../../store/hud/heroGuideStore";
import {HEROES,useAlphaStore,type HeroFilter} from "../../store/alpha/alphaStore";
import {useUIStore} from "../../store/menus/uiStore";
import {useSocialStore} from "../../store/social/socialStore";
import {requestSocial} from "../../net/socialClient";
import {FACTORY_APPEARANCE,useHeroLoadouts,type HeroAppearance} from "../../vehicles/cosmetics/heroLoadouts";
import {useSelectionNavigation} from "../alpha/useSelectionNavigation";
import {navigateFormRows} from "../social/formRows";
import {UI_THEMES} from "../../theme/catalog";
import {usePreferencesStore} from "../../store/preferences/preferencesStore";
import {HeroRoster} from "../alpha/HeroRoster";
import {HoldMainButton} from "./HoldMainButton";
import {SelectionHeader,SelectionFooter} from "../alpha/SelectionChrome";
import {ControllerAction} from "../../components/controller";
import {HeroSaveQueue,type HeroSaveStatus} from "./HeroSaveQueue";
import {VehicleStudio,VehicleStudioNavigation,STOCK_VEHICLE_SUMMARY,type VehiclePerformanceSummary,type VehicleStudioTab} from "./VehicleStudio";
import {VEHICLE_PAINT_PRESETS} from "./vehiclePaintPresets";
import {vehicleCatalog} from "../../store/selection/vehicleCatalog";
import {useVehicleStudioStore,type VehicleStudioPart} from "./vehicleStudioStore";
import {VehicleFlags,hasFlag} from "../../store/input/protocol/inputMasks";
import {useInputStore} from "../../store/input/inputStore";
import {toggleTurnSignal} from "../../ui/Cockpit/stalks/commands";
import {HeroPortrait} from "../alpha/HeroPortrait";
import "../alpha/heroSelection.css";
import "./heroAbilities.css";
import "./heroWorkshop.css";
import "../../theme/vehicleStudio.css";

const NO_OWNED_SKINS:string[]=[];
const NO_VEHICLE_PARTS:VehicleStudioPart[]=[];
const NO_VEHICLE_MOD_STAGES:Record<string,number>={};

export function HeroLoadoutSync(){
 const profile=useSocialStore(s=>s.view?.profile);
 useEffect(()=>{useHeroLoadouts.getState().adopt(profile?.id??null,profile?.progression?.default_hero,profile?.progression?.hero_loadouts);},[profile]);
 return null;
}

/** Vehicle styling and the stock-relative performance page share one studio
 * chrome. Appearance edits save to the authenticated player's vehicle loadout. */
export function HeroWorkshop(){
 const guideOpen=useUIStore(s=>s.overlay==="hero_abilities"||s.overlay==="match_results");
 const owner=useSocialStore(s=>s.view?.profile.id??null);
 const main=useHeroLoadouts(s=>s.ownerId===owner?s.defaultHero:null);
 const skins=useSocialStore(s=>s.view?.alpha?.skins);
 const owned=useSocialStore(s=>s.view?.profile.progression?.owned??NO_OWNED_SKINS);
 const [chosen,setHero]=useState<string|null>(null);
 const hero=chosen??(HEROES.some(item=>item.id===main)?main:null);
 const [editing,setEditing]=useState(false);
 const [role,setRole]=useState<HeroFilter>("all");
 const definition=HEROES.find(item=>item.id===hero)??null;
 const vehicle=definition?.vehicle;
 const saved=useHeroLoadouts(s=>definition?s.loadouts[definition.vehicle]:undefined);
 const [editedAppearance,setAppearance]=useState<HeroAppearance>({...FACTORY_APPEARANCE});
 const appearance=chosen?editedAppearance:saved??FACTORY_APPEARANCE;
 const [status,setStatus]=useState<HeroSaveStatus>("idle"),[message,setMessage]=useState("");
 const root=useRef<HTMLElement>(null),remembered=useRef(new WeakMap<HTMLElement,number>()),leaving=useRef(false);
 const drafts=useRef<Record<string,HeroAppearance>>({});
 const theme=usePreferencesStore(s=>s.theme);
 const [studioTab,setStudioTab]=useState<VehicleStudioTab>("performance");
 const [studioSummary,setStudioSummary]=useState<VehiclePerformanceSummary>(STOCK_VEHICLE_SUMMARY);
 const [studioFooter,setStudioFooter]=useState<ReactNode|null>(null);
 const [vehicleModStages,setVehicleModStages]=useState<Record<string,Record<string,number>>>({});
 const [portraitCapture,setPortraitCapture]=useState<string|null>(null),[portraitMessage,setPortraitMessage]=useState("");
 const availableParts=useVehicleStudioStore(s=>s.availableVehicle===definition?.vehicle?s.availableParts:NO_VEHICLE_PARTS);
 const openedParts=useVehicleStudioStore(s=>s.parts);
 const glassStyle=useVehicleStudioStore(s=>s.glassStyle);
 const setGlassStyle=useVehicleStudioStore(s=>s.setGlassStyle);
 const vehicleFlags=useInputStore(s=>s.input.vehicleMask);
 const setStudioFooterContent=useCallback((content:ReactNode|null)=>setStudioFooter(content),[]);
 const setPerformanceSummary=useCallback((summary:VehiclePerformanceSummary)=>setStudioSummary(summary),[]);
 const updateVehicleModStages=useCallback((stages:Record<string,number>)=>{if(vehicle)setVehicleModStages(previous=>({...previous,[vehicle]:stages}));},[vehicle]);
 const stats=vehicleCatalog.find(item=>item.id===definition?.vehicle)?.stats??{armor:0,speed:0,handling:0,support:0};
 const lightingBits=VehicleFlags.HEADLIGHTS|VehicleFlags.BLINKER_LEFT|VehicleFlags.BLINKER_RIGHT|VehicleFlags.HAZARDS;
 const queue=useMemo(()=>new HeroSaveQueue(async job=>{
  if(!owner||useSocialStore.getState().view?.profile.id!==owner)throw Error("Connect with your player profile to save.");
  await requestSocial("hero_loadout_save",{hero:job.hero,appearance:job.appearance,make_default:job.makeDefault});
 },job=>{if(useHeroLoadouts.getState().ownerId===owner)useHeroLoadouts.getState().save(job.hero,job.vehicle,job.appearance,job.makeDefault);},(next,error)=>{setStatus(next);setMessage(error??"");}),[owner]);
 useEffect(()=>()=>queue.dispose(),[queue]);
 useEffect(()=>{useAlphaStore.setState({previewHero:null});root.current?.focus();},[]);
 useEffect(()=>{if(editing)root.current?.querySelector<HTMLElement>(".vehicle-studio-tab")?.focus({preventScroll:true});else{useVehicleStudioStore.getState().closeParts();root.current?.focus({preventScroll:true});}},[editing]);
 useEffect(()=>{if(hero)useAlphaStore.getState().preview(hero);},[hero]);
 useEffect(()=>{setStudioTab("performance");setStudioSummary(STOCK_VEHICLE_SUMMARY);setStudioFooter(null);setPortraitCapture(null);setPortraitMessage("");},[vehicle]);
 useEffect(()=>{
  if(!editing)return;
  const savedFlags=useInputStore.getState().input.vehicleMask&lightingBits;
  return()=>{const current=useInputStore.getState().input.vehicleMask;useInputStore.getState().setInput({vehicleMask:(current&~lightingBits)|savedFlags});};
 },[editing,lightingBits]);
 useEffect(()=>{useHeroLoadouts.setState({draft:vehicle?{vehicle,appearance}:null});return()=>{useHeroLoadouts.setState({draft:null});};},[vehicle,appearance]);
 const preview=(id:string)=>{
  const item=HEROES.find(value=>value.id===id)!;setHero(id);
  setAppearance(drafts.current[item.vehicle]??useHeroLoadouts.getState().loadouts[item.vehicle]??{...FACTORY_APPEARANCE});
 };
 const openHero=(id=hero)=>{
  if(!id){root.current?.querySelector<HTMLElement>("[data-hero]:not(:disabled)")?.focus({preventScroll:true});return;}
  preview(id);setStudioTab("performance");setEditing(true);
 };
 const showAbilities=()=>{
  if(useUIStore.getState().screen!=="heroes"||useUIStore.getState().overlay!==null)return;
  const focused=(document.activeElement as HTMLElement|null)?.closest<HTMLElement>("[data-hero]")?.dataset.hero;
  openHeroGuide(focused??hero??undefined);
 };
 useEffect(()=>{
  const abilities=(event:Event)=>{const ui=useUIStore.getState();if(ui.screen!=="heroes"||ui.overlay!==null)return;event.stopImmediatePropagation();showAbilities();};
  window.addEventListener("avenlab:hero-abilities",abilities);return()=>window.removeEventListener("avenlab:hero-abilities",abilities);
 });
 const mainChoice=(id=hero)=>{
  if(guideOpen||!id)return;
  const item=HEROES.find(value=>value.id===id)!;
  const style=id===hero?appearance:drafts.current[item.vehicle]??useHeroLoadouts.getState().loadouts[item.vehicle]??{...FACTORY_APPEARANCE};
  queue.enqueue({hero:id,vehicle:item.vehicle,appearance:style,makeDefault:true});
 };
 const edit=(patch:Partial<HeroAppearance>)=>{
  if(!hero||!definition)return;
  const next={...appearance,...patch};drafts.current[definition.vehicle]=next;setAppearance(next);
  queue.enqueue({hero,vehicle:definition.vehicle,appearance:next,makeDefault:false});
 };
 const capturePortrait=async()=>{
  if(!definition)return;setPortraitMessage("CAPTURING CURRENT STYLE…");
  try{const {bakeHeroPortrait}=await import("../preview/bakeHeroPortrait");const image=await bakeHeroPortrait(definition.vehicle,appearance);setPortraitCapture(image);setPortraitMessage("PORTRAIT READY · SESSION PREVIEW");}
  catch(error){setPortraitMessage(error instanceof Error?`CAPTURE FAILED · ${error.message}`:"CAPTURE FAILED");}
 };
 const back=async()=>{
  if(editing){setEditing(false);return;}
  if(leaving.current)return;leaving.current=true;
  try{if(await queue.flush())useUIStore.getState().setScreen("main");}finally{leaving.current=false;}
 };
 useSelectionNavigation(root,{confirm:()=>{
  if(guideOpen)return;const active=document.activeElement as HTMLElement;
  if(active===root.current)openHero();else active?.click();
 },back:()=>{if(!guideOpen)void back();},direction:action=>{
  if(guideOpen)return;const active=document.activeElement;
  if(active instanceof HTMLSelectElement&&(action==="left"||action==="right")){
   active.selectedIndex=(active.selectedIndex+(action==="left"?-1:1)+active.options.length)%active.options.length;
   active.dispatchEvent(new Event("change",{bubbles:true}));
  }else if(root.current)navigateFormRows(root.current,active as HTMLElement,action,remembered.current);
 },tab:direction=>{
  if(guideOpen)return;const visible=HEROES.filter(item=>role==="all"||item.role===role);
  const focused=(document.activeElement as HTMLElement|null)?.closest<HTMLElement>("[data-hero]")?.dataset.hero;
  const index=visible.findIndex(item=>item.id===(focused??hero)),start=index<0?(direction>0?-1:0):index;setEditing(false);
  requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>(`[data-hero="${visible[(start+direction+visible.length)%visible.length].id}"]`)?.focus({preventScroll:true}));
 }});
 const unlocked=(skins??[]).filter(skin=>owned.includes(skin.id));
 const paintPresets=[...VEHICLE_PAINT_PRESETS,{label:`${UI_THEMES[theme].label} accent`,color:UI_THEMES[theme]["scene-tint"]}];
 const partLabels:Record<VehicleStudioPart,string>={"door-left":"LEFT DOOR","door-right":"RIGHT DOOR",hood:"HOOD",trunk:"TRUNK",headlights:"POP-UP HEADLIGHTS"};
 const partOptions:VehicleStudioPart[]=["door-left","door-right","hood","trunk","headlights"];
 const renderPartButton=(part:VehicleStudioPart)=>{
  const supported=availableParts.includes(part),open=openedParts[part];
  return <button key={part} type="button" className="vehicle-studio-feature" data-supported={supported} disabled={!supported} aria-pressed={supported?open:undefined} title={supported?`${open?"Close":"Open"} ${partLabels[part].toLowerCase()}`:`No separate movable ${partLabels[part].toLowerCase()} mesh in this vehicle model`} onClick={()=>useVehicleStudioStore.getState().setPart(part,!open)}>{partLabels[part]} · {supported?(open?"OPEN":"CLOSED"):"NOT RIGGED"}</button>;
 };
 const paintFooter=<div className="vehicle-studio-swatches" aria-label="Paint presets">{paintPresets.map(preset=><button key={preset.label} type="button" className="vehicle-studio-swatch" style={{"--paint-swatch":preset.color==="factory"?"#aeb7c0":preset.color} as CSSProperties} aria-label={`Paint: ${preset.label}`} title={preset.label} aria-pressed={appearance.body===preset.color} disabled={!owner||definition?.vehicle==="tank"} onClick={()=>edit({body:preset.color})}/>)}</div>;
 const bodyFooter=<>{partOptions.map(renderPartButton)}</>;
 const lightingFooter=<>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.HEADLIGHTS)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.HEADLIGHTS)}>HEADLIGHTS · {hasFlag(vehicleFlags,VehicleFlags.HEADLIGHTS)?"ON":"OFF"}</button>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.BLINKER_LEFT)} onClick={()=>toggleTurnSignal(-1)}>LEFT STALK</button>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.BLINKER_RIGHT)} onClick={()=>toggleTurnSignal(1)}>RIGHT STALK</button>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.HAZARDS)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS)}>HAZARDS</button>
 </>;
 const portraitFooter=<button type="button" onClick={()=>void capturePortrait()} disabled={!definition}>CAPTURE CURRENT PORTRAIT</button>;
 const currentFooter=studioTab==="overview"?<span>Vehicle overview · stock baseline and class profile</span>:studioTab==="performance"?studioFooter:studioTab==="paint"?paintFooter:studioTab==="body"?bodyFooter:studioTab==="lighting"?lightingFooter:portraitFooter;
 return <section ref={root} className="game-ui menu-surface alpha-selection hero-selection hero-workshop" data-editing={editing} data-has-selection={hero!==null} inert={guideOpen} tabIndex={-1} aria-label="Heroes garage" data-controller-form data-controller-rows>
  <SelectionHeader title="HEROES" onBack={()=>void back()}>{editing&&definition&&<VehicleStudioNavigation tab={studioTab} onTab={setStudioTab}/>}</SelectionHeader>
  <div className="hero-selection-stage hero-workshop-body">
   {!editing&&<div className="hero-workshop-collection"><HeroRoster selected={hero} main={main} filter={role} busy={!owner} onChoose={openHero} onFilter={filter=>{setRole(filter);setEditing(false);}}/>
    <p className="hero-workshop-hint">Select a portrait to customize. Hold X to choose your main.</p>
    {status!=="idle"&&<div className="hero-collection-save-status" role="status">{status==="error"?`NOT SAVED · ${message}`:status==="saved"?"SAVED TO YOUR PLAYER":"SAVING YOUR STYLE…"}{status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}</div>}
   </div>}
   {!editing&&<section className="hero-summary" aria-label="Selected hero"><small>HERO</small><h2>{definition?.name??"CHOOSE YOUR HERO"}</h2><p>{definition?"Select a vehicle or press A to open the performance garage.":"Choose a vehicle portrait to preview and customize. Your main stays saved."}</p></section>}
   {editing&&definition&&<VehicleStudio name={definition.name} role={definition.role} note={definition.note} stats={stats} summary={studioSummary} tab={studioTab} footer={currentFooter}>
    {studioTab==="overview"&&<section className="vehicle-studio-card vehicle-overview-card"><header><small>HERO VEHICLE</small><h3>{definition.name}</h3></header><p>{definition.note}</p><div className="vehicle-studio-feature-list"><div><span>ROLE</span><strong>{definition.role.toUpperCase()}</strong></div><div><span>CLASS PROFILE</span><strong>ARMOR {stats.armor} · SPEED {stats.speed} · HANDLING {stats.handling}</strong></div><div><span>STOCK BUILD</span><strong>BASELINE READY</strong></div></div></section>}
    {studioTab==="performance"&&<VehicleMods key={`${owner}:${definition.vehicle}`} vehicle={definition.vehicle} stages={vehicleModStages[definition.vehicle]??NO_VEHICLE_MOD_STAGES} onStagesChange={updateVehicleModStages} onSummaryChange={setPerformanceSummary} onFooterChange={setStudioFooterContent}/>}
    {studioTab==="paint"&&<>
     <section className="vehicle-studio-card"><header><small>EXTERIOR COLOR</small><h3>Body paint</h3></header><div className="vehicle-studio-swatches" aria-label="Paint presets">{paintPresets.map(preset=><button key={preset.label} type="button" className="vehicle-studio-swatch" style={{"--paint-swatch":preset.color==="factory"?"#aeb7c0":preset.color} as CSSProperties} aria-label={`Paint: ${preset.label}`} title={preset.label} aria-pressed={appearance.body===preset.color} disabled={!owner||definition.vehicle==="tank"} onClick={()=>edit({body:preset.color})}/>)}</div>
      <label>Custom paint<input type="color" aria-label="Custom hero body color" disabled={!owner||definition.vehicle==="tank"} value={appearance.body==="factory"?"#f1f3f4":appearance.body} onChange={event=>edit({body:event.target.value})}/></label>
     </section>
     <section className="vehicle-studio-card"><header><small>SHARED BODY MATERIAL</small><h3>Finish & metallic</h3></header>
      <label>PAINT FINISH<select aria-label="Hero highlight finish" disabled={!owner} value={appearance.finish} onChange={event=>edit({finish:event.target.value as HeroAppearance["finish"]})}><option value="factory">Factory texture · controlled highlights</option><option value="frs">FR-S glass and gloss profile</option><option value="soft">Soft metallic finish</option></select></label>
      <label>METALLIC / REFLECTION <output>{Math.round(appearance.metallic*100)}%</output><input type="range" min="0" max="1" step="0.01" aria-label="Metallic reflection strength" disabled={!owner||definition.vehicle==="tank"} value={appearance.metallic} onChange={event=>edit({metallic:Number(event.target.value)})}/></label>
     </section>
     <section className="vehicle-studio-card"><header><small>COSMETICS</small><h3>Interior & collection</h3></header>
      <label>UNLOCKED SKIN<select aria-label="Unlocked hero skin" disabled={!owner} value={appearance.skin} onChange={event=>{const skin=unlocked.find(item=>item.id===event.target.value);edit({skin:event.target.value,body:skin&&skin.id!=="factory"?skin.color:"factory"});}}><option value="factory">Factory</option>{unlocked.filter(item=>item.id!=="factory").map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>SEAT COLOR<select aria-label="Hero seat color request" disabled={!owner||definition.vehicle!=="brz"} value={appearance.seats} onChange={event=>edit({seats:event.target.value as HeroAppearance["seats"]})}><option value="factory">Factory</option><option value="black">Black · mapping pending</option><option value="red">Red · mapping pending</option></select></label>
      <p>Seat colors save as requests; the GLB seat material mapping still needs a verified asset pass.</p>
     </section>
    </>}
    {studioTab==="body"&&<>
     <section className="vehicle-studio-card"><header><small>MODEL-SUPPORTED PANELS</small><h3>Open and inspect</h3></header><p>Controls move only separate panel meshes present in this vehicle model. Unsupported parts stay disabled until its GLB has a movable panel.</p><div className="vehicle-studio-feature-list">{partOptions.map(part=><div key={part} data-supported={availableParts.includes(part)}><span>{partLabels[part]}</span><strong>{availableParts.includes(part)?(openedParts[part]?"OPEN":"CLOSED"):"NO MOVING MESH"}</strong></div>)}</div></section>
     <section className="vehicle-studio-card"><header><small>WINDSHIELD / GLASS</small><h3>Choose the glass tone</h3></header><p>Preview a neutral clear or smoked finish. Glass stays transparent and does not recolor body panels or light lenses.</p><div className="vehicle-studio-glass-options">{([["clear","CLEAR"],["light-smoke","LIGHT SMOKE"],["dark-smoke","DARK SMOKE"]] as const).map(([style,label])=><button key={style} type="button" data-glass={style} aria-pressed={glassStyle===style} onClick={()=>setGlassStyle(style)}><i className="vehicle-studio-glass-preview"/><span>{label}</span></button>)}</div></section>
    </>}
    {studioTab==="lighting"&&<section className="vehicle-studio-card"><header><small>LOCAL GARAGE TEST</small><h3>Steering stalks & hazards</h3></header><p>The garage buttons use the same turn-signal commands as the cockpit stalks. The preview flashes the model's named headlight and amber lens materials. Test flags are restored when you leave the garage.</p><div className="vehicle-studio-feature-list"><div><span>HEADLIGHT CIRCUIT</span><strong>{hasFlag(vehicleFlags,VehicleFlags.HEADLIGHTS)?"ON":"OFF"}</strong></div><div><span>LEFT STALK</span><strong>{hasFlag(vehicleFlags,VehicleFlags.BLINKER_LEFT)?"ACTIVE":"CENTER"}</strong></div><div><span>RIGHT STALK</span><strong>{hasFlag(vehicleFlags,VehicleFlags.BLINKER_RIGHT)?"ACTIVE":"CENTER"}</strong></div><div><span>HAZARDS</span><strong>{hasFlag(vehicleFlags,VehicleFlags.HAZARDS)?"ACTIVE":"OFF"}</strong></div></div></section>}
    {studioTab==="studio"&&<section className="vehicle-studio-card"><header><small>PORTRAIT PREVIEW</small><h3>{definition.name}</h3></header>{portraitCapture?<img className="vehicle-studio-portrait" src={portraitCapture} alt={`${definition.name} portrait using current finish settings`}/>:<HeroPortrait hero={definition.id} appearance={appearance} cacheOnly showStyleStatus={false}/>}<p>Capture uses the current paint, shared window profile, and metallic setting. The preview stays in this session.</p><p role="status" aria-live="polite">{portraitMessage||"PORTRAIT READY TO CAPTURE"}</p></section>}
    <p className="vehicle-studio-save-status" role="status" aria-live="polite">{!owner?"CONNECT YOUR PLAYER PROFILE":status==="pending"||status==="saving"?"SAVING YOUR STYLE…":status==="error"?`NOT SAVED · ${message}`:status==="saved"?"SAVED TO YOUR PLAYER · SHARED IN GAME":"Appearance changes save automatically for this vehicle."}</p>
    {status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}
   </VehicleStudio>}
  </div>
  <SelectionFooter selectLabel={editing?"Edit style":"Choose hero"}><div className="hero-workshop-actions">
   <ControllerAction button="Y" type="button" className="menu-control" data-open-hero-abilities onClick={showAbilities}>ABILITIES</ControllerAction>
   <ControllerAction button="A" type="button" className="menu-control" disabled={!owner} onClick={()=>editing?root.current?.querySelector<HTMLElement>(".vehicle-studio-panel select")?.focus():openHero()}>{editing?"EDIT STYLE":"CHOOSE HERO"}</ControllerAction>
   <HoldMainButton key={`${owner}:${hero}:${editing}:${main===hero}:${status==="error"}`} disabled={guideOpen||!owner||!hero||main===hero||status==="error"} selected={main===hero} onComplete={()=>mainChoice()}/>
  </div></SelectionFooter>
 </section>;
}
