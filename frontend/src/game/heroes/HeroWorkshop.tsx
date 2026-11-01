import { useEffect, useRef, useState } from "react";
import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useSocialStore } from "../../store/social/socialStore";
import { requestSocial } from "../../net/socialClient";
import { FACTORY_APPEARANCE, useHeroLoadouts, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import { useSelectionNavigation } from "../alpha/useSelectionNavigation";
import { navigateFormRows } from "../social/formRows";
import { UI_THEMES } from "../../theme/catalog";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import "./heroWorkshop.css";

export function HeroLoadoutSync() {
 const progression=useSocialStore(s=>s.view?.profile.progression);
 useEffect(()=>{if(!progression)return;
  useHeroLoadouts.setState({defaultHero:progression.default_hero??"brz",loadouts:progression.hero_loadouts??{}});
 },[progression]);return null;
}
/** Garage and play use the same model owner. Editing changes a local draft;
 * Save is acknowledged by the server before becoming the equipped loadout. */
export function HeroWorkshop() {
 const [hero,setHero]=useState(()=>useHeroLoadouts.getState().defaultHero);
 const definition=HEROES.find(h=>h.id===hero)??HEROES[0];
 const [appearance,setAppearance]=useState<HeroAppearance>(()=>useHeroLoadouts.getState().loadouts[definition.vehicle]??{...FACTORY_APPEARANCE});
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const pending=useRef(false),root=useRef<HTMLElement>(null),remembered=useRef(new WeakMap<HTMLElement,number>());
 const theme=usePreferencesStore(s=>s.theme);
 useEffect(()=>{root.current?.focus();},[]);
 useEffect(()=>{useAlphaStore.getState().preview(definition.id);},[definition.id]);
 useEffect(()=>{useHeroLoadouts.setState({draft:{vehicle:definition.vehicle,appearance}});return()=>{useHeroLoadouts.setState({draft:null});};},[definition.vehicle,appearance]);
 const choose=(id:string)=>{if(pending.current)return;const h=HEROES.find(h=>h.id===id)!;setHero(id);setAppearance(useHeroLoadouts.getState().loadouts[h.vehicle]??{...FACTORY_APPEARANCE});setStatus("");};
 const save=async()=>{if(pending.current)return;pending.current=true;setBusy(true);setStatus("");try{
  await requestSocial("hero_loadout_save",{hero:definition.id,appearance,make_default:true});
  useHeroLoadouts.getState().save(definition.id,definition.vehicle,appearance);setStatus("DEFAULT HERO & LOADOUT SAVED");
 }catch(e){setStatus((e as Error).message);}finally{pending.current=false;setBusy(false);}};
 const back=()=>{if(!pending.current)useUIStore.getState().setScreen("main");};
 useSelectionNavigation(root,{confirm:()=>{if(document.activeElement===root.current)void save();else (document.activeElement as HTMLElement)?.click();},back,direction:a=>{const active=document.activeElement;
  if(active instanceof HTMLSelectElement&&(a==="left"||a==="right")) {active.selectedIndex=(active.selectedIndex+(a==="left"?-1:1)+active.options.length)%active.options.length;active.dispatchEvent(new Event("change",{bubbles:true}));}
  else if(root.current)navigateFormRows(root.current,active as HTMLElement,a,remembered.current);
 },tab:dir=>choose(HEROES[(HEROES.findIndex(h=>h.id===hero)+dir+HEROES.length)%HEROES.length].id)});
 return <section ref={root} className="game-ui menu-surface hero-workshop" tabIndex={-1} aria-label="Hero modifications" data-controller-form data-controller-rows>
  <header data-controller-row><div><small>YOUR COLLECTION</small><h1>HEROES</h1></div><button className="menu-control" disabled={busy} onClick={back}>BACK</button></header>
  <nav data-controller-row data-controller-columns="1" className="hero-workshop-roster" aria-label="Heroes">{HEROES.map(h=><button className="menu-control" aria-pressed={hero===h.id} key={h.id} disabled={busy} onClick={()=>choose(h.id)}>{h.name}<small>{h.role}</small></button>)}</nav>
  <aside data-controller-row data-controller-columns="1" className="hero-modifications"><h2>{definition.name}</h2><p>{definition.note}</p>
   <label>BODY PAINT<select aria-label="Hero body paint" disabled={busy||definition.vehicle==="tank"} value={appearance.body} onChange={e=>setAppearance({...appearance,body:e.target.value})}>
    <option value="factory">Factory</option><option value="#f4f5f7">Clean white</option><option value="#ed258d">Hot pink</option><option value="#ed9dcc">Pastel pink</option><option value="#161a22">Midnight black</option><option value={UI_THEMES[theme]["scene-tint"]}>Current theme color</option>
    {!["factory","#f4f5f7","#ed258d","#ed9dcc","#161a22",UI_THEMES[theme]["scene-tint"]].includes(appearance.body)&&<option value={appearance.body}>Custom {appearance.body}</option>}
   </select></label>
   <label>CUSTOM BODY COLOR<input aria-label="Custom hero body color" type="color" disabled={busy||definition.vehicle==="tank"} value={appearance.body==="factory"?"#f4f5f7":appearance.body} onChange={e=>setAppearance({...appearance,body:e.target.value})}/></label>
   <label>HIGHLIGHT FINISH<select aria-label="Hero highlight finish" disabled={busy} value={appearance.finish} onChange={e=>setAppearance({...appearance,finish:e.target.value as HeroAppearance["finish"]})}><option value="factory">Factory</option><option value="frs">FR-S reference</option><option value="soft">Soft</option></select></label>
   <label>SEAT COLOR REQUEST<select aria-label="Hero seat color request" disabled={busy||definition.vehicle!=="brz"} value={appearance.seats} onChange={e=>setAppearance({...appearance,seats:e.target.value as HeroAppearance["seats"]})}><option value="factory">Factory</option><option value="black">Black · asset mapping pending</option><option value="red">Red · asset mapping pending</option></select></label>
   {definition.vehicle==="tank"&&<p>Tank paint atlas mapping is pending.</p>}
   <p>Seat colors, stitching, calipers and stripes need per-car material mappings. Seat choices are saved for that integration.</p>
   <button className="menu-control" disabled>EMOTES · COMING LATER</button><button className="menu-control" disabled>SECRET RARE BUNDLES · LOCKED</button>
   <button className="menu-control hero-save" disabled={busy} onClick={()=>void save()}>{busy?"SAVING…":"SAVE & SET DEFAULT HERO"}</button>
   <p role="status">{status}</p>
  </aside>
 </section>;
}
