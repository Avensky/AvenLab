import {openHeroGuide} from "../../store/hud/heroGuideStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { HEROES, useAlphaStore, type HeroFilter } from "../../store/alpha/alphaStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useSocialStore } from "../../store/social/socialStore";
import { requestSocial } from "../../net/socialClient";
import { FACTORY_APPEARANCE, useHeroLoadouts, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import { useSelectionNavigation } from "../alpha/useSelectionNavigation";
import { navigateFormRows } from "../social/formRows";
import { UI_THEMES } from "../../theme/catalog";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { HeroRoster } from "../alpha/HeroRoster";
import { HoldMainButton } from "./HoldMainButton";
import { SelectionHeader, SelectionFooter } from "../alpha/SelectionChrome";
import { ControllerAction } from "../../components/controller";
import { HeroSaveQueue, type HeroSaveStatus } from "./HeroSaveQueue";
import "../alpha/heroSelection.css";
import "./heroAbilities.css";
import "./heroWorkshop.css";

const NO_OWNED_SKINS: string[] = [];

export function HeroLoadoutSync() {
 const profile=useSocialStore(s=>s.view?.profile);
 useEffect(()=>{useHeroLoadouts.getState().adopt(profile?.id??null,profile?.progression?.default_hero,profile?.progression?.hero_loadouts);},[profile]);
 return null;
}
/** Click/A chooses a preview and opens styling. Hold X chooses your main. Appearance edits auto-save to
 * the authenticated actor only, in order, without choosing a different main. */
export function HeroWorkshop() {
 const guideOpen=useUIStore(s=>s.overlay==="hero_abilities"||s.overlay==="match_results");
 const owner=useSocialStore(s=>s.view?.profile.id??null);
 const main=useHeroLoadouts(s=>s.defaultHero);
 const skins=useSocialStore(s=>s.view?.alpha?.skins);
 const owned=useSocialStore(s=>s.view?.profile.progression?.owned??NO_OWNED_SKINS);
 const [hero,setHero]=useState<string|null>(null);
 const [editing,setEditing]=useState(false);
 const [role,setRole]=useState<HeroFilter>("all");
 const definition=HEROES.find(h=>h.id===hero)??null;
 const [appearance,setAppearance]=useState<HeroAppearance>({...FACTORY_APPEARANCE});
 const [status,setStatus]=useState<HeroSaveStatus>("idle"),[message,setMessage]=useState("");
 const root=useRef<HTMLElement>(null),remembered=useRef(new WeakMap<HTMLElement,number>());
 const leaving=useRef(false);
 const drafts=useRef<Record<string,HeroAppearance>>({});
 const theme=usePreferencesStore(s=>s.theme);
 const queue=useMemo(()=>new HeroSaveQueue(async job=>{
  if(!owner||useSocialStore.getState().view?.profile.id!==owner)throw Error("Connect with your player profile to save.");
  await requestSocial("hero_loadout_save",{hero:job.hero,appearance:job.appearance,make_default:job.makeDefault});
 },job=>{if(useHeroLoadouts.getState().ownerId===owner)useHeroLoadouts.getState().save(job.hero,job.vehicle,job.appearance,job.makeDefault);},(next,error)=>{setStatus(next);setMessage(error??"");}),[owner]);
 useEffect(()=>()=>queue.dispose(),[queue]);
 useEffect(()=>{useAlphaStore.setState({previewHero:null});root.current?.focus();},[]);
 useEffect(()=>{if(editing)root.current?.querySelector<HTMLElement>(".hero-modifications")?.focus({preventScroll:true});else root.current?.focus({preventScroll:true});},[editing]);
 useEffect(()=>{if(hero)useAlphaStore.getState().preview(hero);},[hero]);
 const vehicle=definition?.vehicle;
 useEffect(()=>{useHeroLoadouts.setState({draft:vehicle?{vehicle,appearance}:null});return()=>{useHeroLoadouts.setState({draft:null});};},[vehicle,appearance]);
 const preview=(id:string)=>{const h=HEROES.find(h=>h.id===id)!;setHero(id);setAppearance(drafts.current[h.vehicle]??useHeroLoadouts.getState().loadouts[h.vehicle]??{...FACTORY_APPEARANCE});};
 const openHero=(id=hero)=>{if(!id){root.current?.querySelector<HTMLElement>('[data-hero]:not(:disabled)')?.focus({preventScroll:true});return;}preview(id);setEditing(true);};
 const showAbilities=()=>{
  if(useUIStore.getState().screen!=='heroes'||useUIStore.getState().overlay!==null)return;
  const focused=(document.activeElement as HTMLElement|null)?.closest<HTMLElement>('[data-hero]')?.dataset.hero;
  openHeroGuide(focused??hero??undefined);
 };
 useEffect(()=>{
  const abilities=(event:Event)=>{const ui=useUIStore.getState();if(ui.screen!=='heroes'||ui.overlay!==null)return;event.stopImmediatePropagation();showAbilities();};
  window.addEventListener('avenlab:hero-abilities',abilities);
  return()=>window.removeEventListener('avenlab:hero-abilities',abilities);
 });
 const mainChoice=(id=hero)=>{if(guideOpen||!id)return;const h=HEROES.find(h=>h.id===id)!;const style=id===hero?appearance:drafts.current[h.vehicle]??useHeroLoadouts.getState().loadouts[h.vehicle]??{...FACTORY_APPEARANCE};queue.enqueue({hero:id,vehicle:h.vehicle,appearance:style,makeDefault:true});};
 const edit=(patch:Partial<HeroAppearance>)=>{if(!hero||!definition)return;const next={...appearance,...patch};drafts.current[definition.vehicle]=next;setAppearance(next);queue.enqueue({hero,vehicle:definition.vehicle,appearance:next,makeDefault:false});};
 const back=async()=>{if(editing){setEditing(false);return;}if(leaving.current)return;leaving.current=true;try{if(await queue.flush())useUIStore.getState().setScreen("main");}finally{leaving.current=false;}};
 useSelectionNavigation(root,{confirm:()=>{if(guideOpen)return;const active=document.activeElement as HTMLElement;if(active===root.current)openHero();else active?.click();},back:()=>{if(!guideOpen)void back();},direction:a=>{
  if(guideOpen)return;
  const active=document.activeElement;
  if(active instanceof HTMLSelectElement&&(a==="left"||a==="right")){active.selectedIndex=(active.selectedIndex+(a==="left"?-1:1)+active.options.length)%active.options.length;active.dispatchEvent(new Event("change",{bubbles:true}));}
  else if(root.current)navigateFormRows(root.current,active as HTMLElement,a,remembered.current);
 },tab:dir=>{if(guideOpen)return;const visible=HEROES.filter(h=>role==="all"||h.role===role);const focused=(document.activeElement as HTMLElement|null)?.closest<HTMLElement>("[data-hero]")?.dataset.hero;const index=visible.findIndex(h=>h.id===(focused??hero)),start=index<0?(dir>0?-1:0):index;setEditing(false);requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>(`[data-hero="${visible[(start+dir+visible.length)%visible.length].id}"]`)?.focus({preventScroll:true}));}});
 const unlocked=(skins??[]).filter(s=>owned.includes(s.id));
 return <section ref={root} className="game-ui menu-surface alpha-selection hero-selection hero-workshop" data-editing={editing} data-has-selection={hero!==null} inert={guideOpen} tabIndex={-1} aria-label="Hero modifications" data-controller-form data-controller-rows>
  <SelectionHeader title="HEROES" onBack={()=>void back()}/>
  <div className="hero-selection-stage hero-workshop-body">
   {!editing&&<div className="hero-workshop-collection"><HeroRoster selected={hero} main={main} filter={role} busy={!owner} onChoose={openHero} onFilter={filter=>{setRole(filter);setEditing(false);}}/>
    <p className="hero-workshop-hint">Select a portrait to customize. Hold X to choose your main.</p>
    {!editing&&status!=="idle"&&<div className="hero-collection-save-status" role="status">{status==="error"?`NOT SAVED · ${message}`:status==="saved"?"SAVED TO YOUR PLAYER":"SAVING YOUR STYLE…"}{status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}</div>}
   </div>}
   {!editing&&<section className="hero-summary" aria-label="Selected hero"><small>HERO</small><h2>{definition?.name??"CHOOSE YOUR HERO"}</h2><p>{definition?"Select a portrait or press A to open styling.":"Choose a vehicle portrait to preview and customize. Your main stays saved."}</p></section>}
   {editing && definition && <aside data-controller-row data-controller-columns="1" className="hero-modifications" aria-label="Hero styling" tabIndex={-1}><header className="hero-styling-heading"><small>{definition.role.toUpperCase()} · YOUR VEHICLE</small><h2>{definition.name}</h2><p>Style changes save automatically to your player.</p></header>
    <section className="hero-ability-card hero-style-section"><header><div><small>COSMETICS</small><h3>Skin & finish</h3></div></header>
    <label>UNLOCKED SKIN<select aria-label="Unlocked hero skin" disabled={!owner} value={appearance.skin} onChange={e=>{const skin=unlocked.find(s=>s.id===e.target.value);edit({skin:e.target.value,body:skin&&skin.id!=="factory"?skin.color:"factory"});}}><option value="factory">Factory</option>{unlocked.filter(s=>s.id!=="factory").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </section>
    <section className="hero-ability-card hero-style-section"><header><div><small>EXTERIOR</small><h3>Body paint</h3></div></header>
    <label>BODY PAINT<select aria-label="Hero body paint" disabled={!owner||definition.vehicle==="tank"} value={appearance.body} onChange={e=>edit({body:e.target.value})}>
     <option value="factory">Factory</option><option value="#f4f5f7">Clean white</option><option value="#ed258d">Hot pink</option><option value="#ed9dcc">Pastel pink</option><option value="#161a22">Midnight black</option><option value={UI_THEMES[theme]["scene-tint"]}>Current theme color · this car</option>
     {!["factory","#f4f5f7","#ed258d","#ed9dcc","#161a22",UI_THEMES[theme]["scene-tint"]].includes(appearance.body)&&<option value={appearance.body}>Custom {appearance.body}</option>}
    </select></label>
    <label>CUSTOM BODY COLOR<input aria-label="Custom hero body color" type="color" disabled={!owner||definition.vehicle==="tank"} value={appearance.body==="factory"?"#f4f5f7":appearance.body} onChange={e=>edit({body:e.target.value})}/></label>
    </section>
    <section className="hero-ability-card hero-style-section"><header><div><small>SURFACE</small><h3>Highlight finish</h3></div></header>
    <label>HIGHLIGHT FINISH<select aria-label="Hero highlight finish" disabled={!owner} value={appearance.finish} onChange={e=>edit({finish:e.target.value as HeroAppearance["finish"]})}><option value="factory">Factory</option><option value="frs">FR-S reference</option><option value="soft">Soft</option></select></label>
    </section>
    <section className="hero-ability-card hero-style-section"><header><div><small>INTERIOR</small><h3>Seats & details</h3></div></header>
    <label>SEAT COLOR REQUEST<select aria-label="Hero seat color request" disabled={!owner||definition.vehicle!=="brz"} value={appearance.seats} onChange={e=>edit({seats:e.target.value as HeroAppearance["seats"]})}><option value="factory">Factory</option><option value="black">Black · pending asset mapping</option><option value="red">Red · pending asset mapping</option></select></label>
    <p className="hero-pending-note">PENDING · Seat materials, stitching, calipers and stripes need asset mapping and your visual feedback. Seat requests save now; their colors are not rendered yet.</p>
    {definition.vehicle==="tank"&&<p>PENDING · Tank paint atlas mapping.</p>}
    </section>
    <section className="hero-ability-card hero-style-section"><header><div><small>COLLECTION</small><h3>Unlocks</h3></div></header>
    <button className="menu-control" disabled>EMOTES · INCOMING / NEEDS TESTING</button><button className="menu-control" disabled>SECRET RARE BUNDLES · LOCKED</button>
    </section>
    <div className="hero-style-save-status"><p role="status" aria-live="polite">{!owner?"CONNECT YOUR PLAYER PROFILE":status==="pending"||status==="saving"?"SAVING YOUR STYLE…":status==="error"?`NOT SAVED · ${message}`:status==="saved"?"SAVED TO YOUR PLAYER · SHARED IN GAME":"Changes save automatically for this vehicle."}</p>
    {status==="error"&&<button className="menu-control" onClick={()=>void queue.flush()}>RETRY SAVE</button>}</div>
   </aside>}
  </div>
  <SelectionFooter selectLabel={editing?"Edit style":"Choose hero"}><div className="hero-workshop-actions">
   <ControllerAction button="Y" type="button" className="menu-control" data-open-hero-abilities onClick={showAbilities}>ABILITIES</ControllerAction>
   {<ControllerAction button="A" type="button" className="menu-control" disabled={!owner} onClick={()=>editing?root.current?.querySelector<HTMLElement>(".hero-modifications select")?.focus():openHero()}> {editing?"EDIT STYLE":"CHOOSE HERO"}</ControllerAction>}
   {<HoldMainButton key={`${owner}:${hero}:${editing}:${main===hero}:${status==="error"}`} disabled={guideOpen||!owner||!hero||status==="error"} selected={main===hero} onComplete={()=>mainChoice()}/>}
  </div></SelectionFooter>
 </section>;
}
