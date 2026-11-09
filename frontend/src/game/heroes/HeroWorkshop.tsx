import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from "react";
import {VehicleMods} from "./VehicleMods";
import {SceneTabHeader} from "../../components/menus/SceneTabHeader";
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
import {heroRoleHeaderTabs} from "../alpha/heroRoleFilters";
import {HoldMainButton} from "./HoldMainButton";
import {SelectionFooter,SelectionHeader} from "../alpha/SelectionChrome";
import {CharacterEntry,CharacterPage} from "../characters/CharacterPage";
import {ControllerAction} from "../../components/controller";
import {useMenuInputDevice} from "../../components/controller/useMenuInputDevice";
import {HeroSaveQueue,type HeroSaveStatus} from "./HeroSaveQueue";
import {VehicleStudio,VEHICLE_STUDIO_TABS,VehicleStudioTabIcon,STOCK_VEHICLE_SUMMARY,type VehiclePerformanceSummary,type VehicleStudioTab} from "./VehicleStudio";
import {VEHICLE_PAINT_PRESETS} from "./vehiclePaintPresets";
import {getVehicleStockPerformance} from "./vehiclePerformance";
import {useVehicleStudioStore,type VehicleStudioPart} from "./vehicleStudioStore";
import {VehicleFlags,hasFlag} from "../../store/input/protocol/inputMasks";
import {useInputStore} from "../../store/input/inputStore";
import {toggleTurnSignal} from "../../ui/Cockpit/stalks/commands";
import {HeroPortrait} from "../alpha/HeroPortrait";
import {HeroAbilityDetails} from "./HeroAbilities";
import {HeroConceptGallery} from "./HeroConceptGallery";
import "../alpha/heroSelection.css";
import "./heroAbilities.css";
import "./heroWorkshop.css";
import "../../theme/vehicleStudio.css";

const NO_OWNED_SKINS:string[]=[];
const NO_VEHICLE_PARTS:VehicleStudioPart[]=[];
const NO_VEHICLE_MOD_STAGES:Record<string,number>={};
type WorkshopFilter=HeroFilter|"concepts";
type WorkshopPage="heroes"|"garage"|"character";
const WORKSHOP_TABS=[...heroRoleHeaderTabs(true),{id:"concepts",label:"CONCEPTS"}];

export function HeroLoadoutSync(){
 const profile=useSocialStore(s=>s.view?.profile);
 useEffect(()=>{useHeroLoadouts.getState().adopt(profile?.id??null,profile?.progression?.default_hero,profile?.progression?.hero_loadouts);},[profile]);
 return null;
}

/** Vehicle styling and the stock-relative performance page share one studio
 * chrome. Appearance edits save to the authenticated player's vehicle loadout. */
export function HeroWorkshop({onCharacterViewChange}:{onCharacterViewChange?:(open:boolean)=>void}={}){
 const inputDevice=useMenuInputDevice();
 const overlay=useUIStore(s=>s.overlay);
 const owner=useSocialStore(s=>s.view?.profile.id??null);
 const main=useHeroLoadouts(s=>s.ownerId===owner?s.defaultHero:null);
 const skins=useSocialStore(s=>s.view?.alpha?.skins);
 const owned=useSocialStore(s=>s.view?.profile.progression?.owned??NO_OWNED_SKINS);
 const [chosen,setHero]=useState<string|null>(null);
 const hero=chosen??(HEROES.some(item=>item.id===main)?main:null);
 const [page,setPage]=useState<WorkshopPage>("heroes");
 const editing=page==="garage";
 const characterOpen=page==="character";
 const [role,setRole]=useState<WorkshopFilter>("all");
 const definition=HEROES.find(item=>item.id===hero)??null;
 const vehicle=definition?.vehicle;
 const saved=useHeroLoadouts(s=>definition?s.loadouts[definition.vehicle]:undefined);
 const [editedAppearance,setAppearance]=useState<HeroAppearance>({...FACTORY_APPEARANCE});
 const appearance=chosen?editedAppearance:saved??FACTORY_APPEARANCE;
 const [status,setStatus]=useState<HeroSaveStatus>("idle"),[message,setMessage]=useState("");
 const root=useRef<HTMLElement>(null);
 const remembered=useRef(new WeakMap<HTMLElement,number>()),leaving=useRef(false);
 const drafts=useRef<Record<string,HeroAppearance>>({});
 const theme=usePreferencesStore(s=>s.theme);
 const speedUnit=usePreferencesStore(s=>s.speedUnit);
 const [studioTab,setStudioTab]=useState<VehicleStudioTab>("performance");
 const viewingConcepts=page==="heroes"&&role==="concepts";
 const viewingReference=viewingConcepts||(editing&&studioTab==="abilities");
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
 const lightingBits=VehicleFlags.HEADLIGHTS|VehicleFlags.BLINKER_LEFT|VehicleFlags.BLINKER_RIGHT|VehicleFlags.HAZARDS;
 const queue=useMemo(()=>new HeroSaveQueue(async job=>{
  if(!owner||useSocialStore.getState().view?.profile.id!==owner)throw Error("Connect with your player profile to save.");
  await requestSocial("hero_loadout_save",{hero:job.hero,appearance:job.appearance,make_default:job.makeDefault});
 },job=>{if(useHeroLoadouts.getState().ownerId===owner)useHeroLoadouts.getState().save(job.hero,job.vehicle,job.appearance,job.makeDefault);},(next,error)=>{setStatus(next);setMessage(error??"");}),[owner]);
 useEffect(()=>()=>queue.dispose(),[queue]);
 useEffect(()=>{useAlphaStore.setState({previewHero:null});root.current?.focus();},[]);
 useEffect(()=>{if(!editing)useVehicleStudioStore.getState().closeParts();},[editing]);
 useEffect(()=>{
  if(!characterOpen)return;
  onCharacterViewChange?.(true);
  return ()=>onCharacterViewChange?.(false);
 },[characterOpen,onCharacterViewChange]);
 useEffect(()=>{
  const target=characterOpen?root.current?.querySelector<HTMLElement>('[data-character-option][aria-pressed="true"]')
   : viewingReference?root.current?.querySelector<HTMLElement>(".hero-guide-scroll")
   : editing?root.current?.querySelector<HTMLElement>("[role=tab][aria-selected=true]"):root.current;
  target?.focus({preventScroll:true});
 },[characterOpen,editing,role,studioTab,viewingReference]);
 useEffect(()=>{if(hero)useAlphaStore.getState().preview(hero);},[hero]);
 useEffect(()=>{setStudioTab("performance");setStudioSummary(vehicle?getVehicleStockPerformance(vehicle):STOCK_VEHICLE_SUMMARY);setStudioFooter(null);setPortraitCapture(null);setPortraitMessage("");},[vehicle]);
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
  preview(id);setStudioTab("performance");setPage("garage");
 };
 const mainChoice=(id=hero)=>{
  if(viewingReference||characterOpen||!id)return;
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
  if(page!=="heroes"){setPage("heroes");return;}
  if(leaving.current)return;leaving.current=true;
  try{if(await queue.flush())useUIStore.getState().setScreen("main");}finally{leaving.current=false;}
 };
 useSelectionNavigation(root,{confirm:()=>{
  const active=document.activeElement as HTMLElement;
  if(active===root.current&&page==="heroes"&&!viewingReference)openHero();else if(root.current?.contains(active))active.click();
 },back:()=>void back(),direction:action=>{
  const active=document.activeElement;
  if(viewingReference&&(action==="up"||action==="down")){
   root.current?.querySelector(".hero-guide-scroll")?.scrollBy({top:action==="up"?-180:180,behavior:"smooth"});
   return;
  }
  if(active instanceof HTMLSelectElement&&(action==="left"||action==="right")){
   active.selectedIndex=(active.selectedIndex+(action==="left"?-1:1)+active.options.length)%active.options.length;
   active.dispatchEvent(new Event("change",{bubbles:true}));
  }else if(root.current)navigateFormRows(root.current,active as HTMLElement,action,remembered.current);
 },tab:direction=>{
  if(characterOpen)return;
  if(editing){
   const index=VEHICLE_STUDIO_TABS.findIndex(item=>item.id===studioTab);
   setStudioTab(VEHICLE_STUDIO_TABS[(index+direction+VEHICLE_STUDIO_TABS.length)%VEHICLE_STUDIO_TABS.length].id);
   return;
  }
  const index=WORKSHOP_TABS.findIndex(item=>item.id===role);
  setRole(WORKSHOP_TABS[(index+direction+WORKSHOP_TABS.length)%WORKSHOP_TABS.length].id as WorkshopFilter);
 }});
 const unlocked=(skins??[]).filter(skin=>owned.includes(skin.id));
 const paintPresets=[...VEHICLE_PAINT_PRESETS,{label:`${UI_THEMES[theme].label} accent`,color:UI_THEMES[theme]["scene-tint"]}];
 const partLabels:Record<VehicleStudioPart,string>={"door-left":"LEFT DOOR","door-right":"RIGHT DOOR",hood:"HOOD",trunk:"TRUNK",headlights:"POP-UP HEADLIGHTS"};
 const partOptions:VehicleStudioPart[]=["door-left","door-right","hood","trunk","headlights"];
 const renderPartButton=(part:VehicleStudioPart)=>{
  const supported=availableParts.includes(part),open=openedParts[part];
  return <button key={part} type="button" className="vehicle-studio-feature" data-supported={supported} disabled={!supported} aria-pressed={supported?open:undefined} title={supported?`${open?"Close":"Open"} ${partLabels[part].toLowerCase()}`:`No separate movable ${partLabels[part].toLowerCase()} mesh in this vehicle model`} onClick={()=>useVehicleStudioStore.getState().setPart(part,!open)}>{partLabels[part]} · {supported?(open?"OPEN":"CLOSED"):"NOT RIGGED"}</button>;
 };
 const bodyFooter=<>{partOptions.map(renderPartButton)}</>;
 const lightingFooter=<>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.HEADLIGHTS)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.HEADLIGHTS)}>HEADLIGHTS · {hasFlag(vehicleFlags,VehicleFlags.HEADLIGHTS)?"ON":"OFF"}</button>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.BLINKER_LEFT)} onClick={()=>toggleTurnSignal(-1)}>LEFT STALK</button>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.BLINKER_RIGHT)} onClick={()=>toggleTurnSignal(1)}>RIGHT STALK</button>
  <button type="button" aria-pressed={hasFlag(vehicleFlags,VehicleFlags.HAZARDS)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS)}>HAZARDS</button>
 </>;
 const portraitFooter=<button type="button" onClick={()=>void capturePortrait()} disabled={!definition}>CAPTURE CURRENT PORTRAIT</button>;
 const currentFooter=studioTab==="performance"?studioFooter:studioTab==="body"?bodyFooter:studioTab==="lighting"?lightingFooter:studioTab==="studio"?portraitFooter:null;
 return <section ref={root} className={`game-ui menu-surface alpha-selection hero-selection hero-workshop${viewingReference?" hero-ability-guide":""}`} data-character-page={characterOpen||undefined} data-has-selection={hero!==null} inert={overlay!==null} tabIndex={-1} aria-label={characterOpen?"Character":"Heroes garage"} data-controller-form data-controller-rows>
  {characterOpen?<SelectionHeader title="CHARACTER" compact/>:editing&&definition
    ? <SceneTabHeader
        title="GARAGE"
        compact
        activeTab={studioTab}
        onTabChange={next=>setStudioTab(next as VehicleStudioTab)}
        idPrefix="vehicle-studio"
        panelId="vehicle-studio-tab-panel"
        tabs={VEHICLE_STUDIO_TABS.map((item,index)=>({
          ...item,
          icon:<VehicleStudioTabIcon tab={item.id}/>,
          grow:[.92,1.12,1.05,.78,.9,.8][index],
          separatorBefore:item.id==="studio",
        }))}
      />
    : <SceneTabHeader title="HEROES" compact tabs={WORKSHOP_TABS} activeTab={role}
        tablistClassName="hero-pick-tabs" onTabChange={next=>setRole(next as WorkshopFilter)}
        idPrefix="hero-workshop-role" panelId="hero-workshop-role-panel"/>}
  <div className="hero-selection-stage hero-workshop-body">
   {characterOpen&&<CharacterPage/>}
   {viewingConcepts&&<div className="hero-guide-scroll" id="hero-workshop-role-panel" role="tabpanel" aria-labelledby="hero-workshop-role-tab-concepts" tabIndex={0}><HeroConceptGallery/></div>}
   {page==="heroes"&&role!=="concepts"&&<div className="hero-picker-stage hero-workshop-picker" data-hero-filter={role} id="hero-workshop-role-panel" role="tabpanel" aria-labelledby={"hero-workshop-role-tab-"+role}>
    <div className="hero-picker-scene hero-picker-preview">
      <div className="hero-workshop-intro">
        <section className="hero-summary" aria-label="Selected hero">
         <small>HERO</small>
         <h2>{definition?.name??"CHOOSE YOUR HERO"}</h2>
         <p>Choose a vehicle portrait to open its garage.</p>
         <p>Hold {inputDevice==="touch"?"Set Main":"X"} to set your favorite.</p>
        </section>
        <CharacterEntry onOpen={()=>setPage("character")}/>
      </div>
        {status!=="idle"&&<div className="hero-collection-save-status" role="status">{status==="error"?`NOT SAVED · ${message}`:status==="saved"?"SAVED TO YOUR PLAYER":"SAVING YOUR STYLE…"}{status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}</div>}
    </div>
    <HeroRoster showFilters={false} allowBoats selected={hero} main={main} filter={role} busy={!owner} onChoose={openHero} onFilter={setRole}/>
   </div>}
   {editing&&definition&&<VehicleStudio name={definition.name} role={definition.role} note={definition.note} vehicleId={definition.vehicle} speedUnit={speedUnit} stages={vehicleModStages[definition.vehicle]??NO_VEHICLE_MOD_STAGES} summary={studioSummary} tab={studioTab} footer={currentFooter}>
    {studioTab==="abilities"&&<HeroAbilityDetails heroId={definition.id}/>}
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
    {(!owner||status!=="idle")&&<p className="vehicle-studio-save-status" role="status" aria-live="polite">{!owner?"CONNECT YOUR PLAYER PROFILE":status==="pending"||status==="saving"?"SAVING YOUR STYLE…":status==="error"?`NOT SAVED · ${message}`:status==="saved"?"SAVED TO YOUR PLAYER · SHARED IN GAME":"Appearance changes save automatically for this vehicle."}</p>}
    {status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}
   </VehicleStudio>}
  </div>
  <SelectionFooter tabs={!characterOpen} hasPrimaryAction backAction={{onClick:()=>void back(),label:"Back"}}>{!characterOpen&&<div className="hero-workshop-actions">
   {!viewingReference&&<ControllerAction button="A" type="button" className="menu-control" disabled={!owner} tabIndex={-1} onClick={()=>editing?setPage("heroes"):openHero()}>{editing?"APPLY":"OPEN GARAGE"}</ControllerAction>}
   <HoldMainButton key={`${owner}:${hero}:${editing}:${viewingReference}:${main===hero}:${status==="error"}`} disabled={overlay!==null||viewingReference||!owner||!hero||main===hero||status==="error"} selected={hero!==null&&main===hero} onComplete={()=>mainChoice()}/>
  </div>}</SelectionFooter>
 </section>;
}
