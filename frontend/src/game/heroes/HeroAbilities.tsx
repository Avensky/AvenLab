import {useCallback,useEffect,useRef,useState} from 'react';
import {HEROES} from '../../store/alpha/alphaStore';
import {useUIStore} from '../../store/menus/uiStore';
import {closeHeroGuide,useHeroGuideStore} from '../../store/hud/heroGuideStore';
import {usePreferencesStore} from '../../store/preferences/preferencesStore';
import {ControllerAction} from '../../components/controller';
import {HeroPortrait} from '../alpha/HeroPortrait';
import {SelectionHeader,SelectionFooter} from '../alpha/SelectionChrome';
import {AttackIcon} from '../../combat/AttackIcon';
import {trapMenuFocus} from '../../components/menus/menuFocus';
import {getHeroAbilityGuide,HERO_EFFECT_GUIDE,type HeroAbility} from './heroAbilityCatalog';
import {HeroConceptGallery} from './HeroConceptGallery';
import '../alpha/heroSelection.css';
import './heroAbilities.css';

function AbilityCard({ability,slot}:{ability:HeroAbility;slot?:string}){
 return <article className="hero-ability-card" data-planned={ability.state==='planned'}>
  <header><span className="hero-ability-icon"><AttackIcon kind={ability.icon}/></span><div><small>{slot??'WEAPON'} · {ability.state==='planned'?'PLANNED':'LIVE ALPHA'}</small><h3>{ability.name}</h3></div></header>
  <p>{ability.description}</p>
  {ability.stats.length>0&&<dl>{ability.stats.map(stat=><div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
  {ability.notes&&<p className="hero-ability-notes">{ability.notes}</p>}
 </article>;
}

/** A help overlay over the existing garage/world. Viewing heroes never equips
 * them or starts a simulation, and Back restores the exact underlying view. */
export function HeroAbilities(){
 const screen=useUIStore(s=>s.screen);
 const selected=useHeroGuideStore(s=>s.selectedHero),choose=useHeroGuideStore(s=>s.chooseHero);
 const [conceptsOpen,setConceptsOpen]=useState(false),conceptsRef=useRef(false);
 const showConcepts=useCallback((open:boolean)=>{conceptsRef.current=open;setConceptsOpen(open);},[]);
 const root=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null);
 const hero=HEROES.find(item=>item.id===selected)??HEROES[0],guide=getHeroAbilityGuide(hero.id);
 const fireKey=usePreferencesStore(s=>s.bindings.fire);
 const secondaryKey=usePreferencesStore(s=>s.bindings.secondaryFire);
 const keyLabel=(key:string)=>key.replace(/^Key|^Digit/,'');
 useEffect(()=>{
  root.current?.focus({preventScroll:true});
  const cycle=(step:number)=>{
   const entries=[...HEROES.map(item=>item.id),'concepts'],current=conceptsRef.current?'concepts':useHeroGuideStore.getState().selectedHero;
   const index=entries.indexOf(current),next=entries[(index+step+entries.length)%entries.length];
   showConcepts(next==='concepts');
   if(next!=='concepts')useHeroGuideStore.getState().chooseHero(next);
  };
  const navigate=(action:string)=>{
   if(useUIStore.getState().overlay!=='hero_abilities')return;
   if(action==='back'){closeHeroGuide();return;}
   if(action==='previous_tab'||action==='left'){cycle(-1);return;}
   if(action==='next_tab'||action==='right'){cycle(1);return;}
   if(action==='up'||action==='down'){scroll.current?.scrollBy({top:action==='up'?-180:180,behavior:'smooth'});return;}
   if(action==='activate'){
    const active=document.activeElement as HTMLElement|null;
    if(active?.closest('.hero-ability-guide')&&active!==root.current)active.click();
   }
  };
  const panel=(event:Event)=>{if(useUIStore.getState().overlay!=='hero_abilities')return;event.stopImmediatePropagation();navigate((event as CustomEvent<string>).detail);};
  const keyboard=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
   const action=({Escape:'back',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyQ:'previous_tab',KeyE:'next_tab',Enter:'activate',Space:'activate'} as Record<string,string>)[event.code];
   if(action){event.preventDefault();event.stopPropagation();if(!event.repeat||action==='up'||action==='down')navigate(action);}
  };
  const heroAction=(event:Event)=>{if(useUIStore.getState().screen==='heroes'&&useUIStore.getState().overlay==='hero_abilities'){event.stopImmediatePropagation();closeHeroGuide();}};
  window.addEventListener('avenlab:hero-abilities',heroAction);window.addEventListener('avenlab:panel-action',panel);const node=root.current;node?.addEventListener('keydown',keyboard);
  return()=>{window.removeEventListener('avenlab:hero-abilities',heroAction);window.removeEventListener('avenlab:panel-action',panel);node?.removeEventListener('keydown',keyboard);};
 },[showConcepts]);
 useEffect(()=>{scroll.current?.scrollTo({top:0});const card=root.current?.querySelector<HTMLElement>(conceptsOpen?'[data-guide-concepts]':`[data-guide-hero="${selected}"]`);card?.focus({preventScroll:true});card?.scrollIntoView({block:'nearest',inline:'nearest'});},[selected,conceptsOpen]);
 return <section ref={root} className="game-ui menu-surface alpha-selection hero-selection hero-ability-guide" data-context={screen==='heroes'?'garage':'world'} role="dialog" aria-modal="true" aria-label="Hero abilities" tabIndex={-1} onKeyDown={trapMenuFocus}>
  <SelectionHeader title={conceptsOpen?'HERO CONCEPTS':'HERO ABILITIES'} onBack={closeHeroGuide}/>
  <nav className="hero-guide-roster" aria-label="Hero ability selection">{HEROES.map(item=><button type="button" key={item.id} data-guide-hero={item.id} className="hero-guide-portrait menu-control" aria-pressed={!conceptsOpen&&item.id===hero.id} aria-label={`View ${item.name} abilities`} onClick={()=>{showConcepts(false);choose(item.id);}}><HeroPortrait hero={item.id}/><span>{item.name}</span></button>)}<button type="button" data-guide-concepts className="hero-guide-portrait hero-guide-concepts menu-control" aria-pressed={conceptsOpen} aria-label="View planned hero concepts" onClick={()=>showConcepts(true)}><span className="hero-guide-concept-symbol" aria-hidden="true">＋</span><span>CONCEPTS · PLANNED</span></button></nav>
  <div ref={scroll} className="hero-guide-scroll" tabIndex={0} aria-label="Ability descriptions">
   {conceptsOpen?<HeroConceptGallery/>:<div className="hero-guide-body">
    <aside className="hero-guide-showcase" aria-label={`${hero.name} overview`}><HeroPortrait hero={hero.id}/><div><small>{guide.role} · {guide.hp.toLocaleString()} HULL HP</small><h1>{hero.name}</h1><p>{guide.description}</p><p className="hero-guide-preview-note">{screen==='heroes'?'GARAGE PREVIEW · Your main hero and saved style stay unchanged.':'STYLE PREVIEW · Viewing this guide keeps your current vehicle in the world.'}</p></div></aside>
    <main className="hero-guide-details">
     <section aria-labelledby="hero-guide-weapons"><h2 id="hero-guide-weapons">WEAPONS</h2><p className="hero-guide-section-note">Primary fire: {keyLabel(fireKey)} or Xbox RB. {guide.weapons.length>1&&<>Secondary fire: {keyLabel(secondaryKey)} or Xbox D-pad Right. </>}Customize controls in Settings.</p><div className="hero-weapon-grid">{guide.weapons.map(weapon=><AbilityCard key={weapon.id} ability={weapon}/>)}{guide.trialAccessory&&<AbilityCard ability={guide.trialAccessory} slot="HUD TEST"/>}</div></section>
     <section aria-labelledby="hero-guide-abilities"><h2 id="hero-guide-abilities">THREE ABILITIES + ULTIMATE</h2><div className="hero-ability-grid">{guide.abilities.map((ability,index)=><AbilityCard key={ability.id} ability={ability} slot={`ABILITY ${index+1}`}/>)}<AbilityCard ability={guide.ultimate} slot="ULTIMATE"/></div></section>
     <section aria-labelledby="hero-guide-effects"><h2 id="hero-guide-effects">BUFFS & DEBUFFS</h2><p className="hero-guide-section-note">These explain the circular status icons shown during play. Timed effects use server-confirmed duration; engine penalties stay active until the vehicle recovers.</p><div className="hero-effect-grid">{HERO_EFFECT_GUIDE.map(effect=><article key={effect.id} data-kind={effect.kind} data-nature={effect.nature}><span className="hero-ability-icon"><AttackIcon kind={effect.icon}/></span><div><h3>{effect.label} <small>{effect.kind.toUpperCase()}{effect.duration?` · ${effect.duration}s`:''}</small></h3><p>{effect.description}</p></div></article>)}</div></section>
     <p className="hero-guide-service-note">FIELD SERVICE · Repair or combined bays restore 10% maximum HP per second while stopped. Fuel-only bays do not heal HP. Disabled vehicles have a 12-second mechanic recovery window, then recover at a safe spawn. Ordinary respawns receive 2 seconds of protection; mechanic recovery receives 1 second.</p>
    </main>
   </div>}
  </div>
  <SelectionFooter selectLabel="View" >{screen==='heroes'&&<ControllerAction button="Y" keyboard="F1" className="menu-control" data-close-hero-abilities onClick={closeHeroGuide}>CLOSE ABILITIES</ControllerAction>}<ControllerAction button="B" className="menu-control" onClick={closeHeroGuide}>BACK TO {screen==='heroes'?'HERO':'GAME'}</ControllerAction></SelectionFooter>
 </section>;
}
