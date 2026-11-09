import {useEffect,useRef,useState} from 'react';
import {HEROES} from '../../store/alpha/alphaStore';
import {useUIStore} from '../../store/menus/uiStore';
import {closeHeroGuide,useHeroGuideStore} from '../../store/hud/heroGuideStore';
import {usePreferencesStore} from '../../store/preferences/preferencesStore';
import {SceneTabHeader} from '../../components/menus/SceneTabHeader';
import {HeroPortrait} from '../alpha/HeroPortrait';
import {SelectionFooter} from '../alpha/SelectionChrome';
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

/** Vehicle details shared by the garage and the active driving session. */
export function HeroAbilityDetails({heroId}:{heroId:string}){
 const hero=HEROES.find(item=>item.id===heroId);
 const fireKey=usePreferencesStore(s=>s.bindings.fire);
 const secondaryKey=usePreferencesStore(s=>s.bindings.secondaryFire);
 const keyLabel=(key:string)=>key.replace(/^Key|^Digit/,'');
 if(!hero)return null;
 const guide=getHeroAbilityGuide(hero.id);
 return <div className="hero-guide-body">
    <aside className="hero-guide-showcase" aria-label={`${hero.name} overview`}><HeroPortrait hero={hero.id}/><div><small>{guide.role} · {guide.hp.toLocaleString()} HULL HP</small><h2>{hero.name}</h2><p>{guide.description}</p></div></aside>
    <main className="hero-guide-details">
     <section aria-labelledby="hero-guide-weapons"><h2 id="hero-guide-weapons">WEAPONS</h2><p className="hero-guide-section-note">Primary fire: {keyLabel(fireKey)} or Xbox RB. {guide.weapons.length>1&&<>Secondary fire: {keyLabel(secondaryKey)} or Xbox D-pad Right. </>}Customize controls in Settings.</p><div className="hero-weapon-grid">{guide.weapons.map(weapon=><AbilityCard key={weapon.id} ability={weapon}/>)}{guide.trialAccessory&&<AbilityCard ability={guide.trialAccessory} slot="HUD TEST"/>}</div></section>
     <section aria-labelledby="hero-guide-abilities"><h2 id="hero-guide-abilities">THREE ABILITIES + ULTIMATE</h2><div className="hero-ability-grid">{guide.abilities.map((ability,index)=><AbilityCard key={ability.id} ability={ability} slot={`ABILITY ${index+1}`}/>)}<AbilityCard ability={guide.ultimate} slot="ULTIMATE"/></div></section>
     <section aria-labelledby="hero-guide-effects"><h2 id="hero-guide-effects">BUFFS & DEBUFFS</h2><p className="hero-guide-section-note">These explain the circular status icons shown during play. Timed effects use server-confirmed duration; engine penalties stay active until the vehicle recovers.</p><div className="hero-effect-grid">{HERO_EFFECT_GUIDE.map(effect=><article key={effect.id} data-kind={effect.kind} data-nature={effect.nature}><span className="hero-ability-icon"><AttackIcon kind={effect.icon}/></span><div><h3>{effect.label} <small>{effect.kind.toUpperCase()}{effect.duration?` · ${effect.duration}s`:''}</small></h3><p>{effect.description}</p></div></article>)}</div></section>
     <p className="hero-guide-service-note">FIELD SERVICE · Repair or combined bays restore 10% maximum HP per second while stopped. Fuel-only bays do not heal HP. Disabled vehicles have a 12-second mechanic recovery window, then recover at a safe spawn. Ordinary respawns receive 2 seconds of protection; mechanic recovery receives 1 second.</p>
    </main>
   </div>;
}

const GUIDE_TABS=[{id:'vehicle',label:'VEHICLE'},{id:'concepts',label:'CONCEPTS'}] as const;

/** In play the guide reads the active vehicle. The garage owns its own roster. */
export function HeroAbilities(){
 const selected=useHeroGuideStore(s=>s.selectedHero);
 const [tab,setTab]=useState('vehicle');
 const root=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  root.current?.focus({preventScroll:true});
  const navigate=(action:string)=>{
   if(useUIStore.getState().overlay!=='hero_abilities')return;
   if(action==='back'){closeHeroGuide();return;}
   if(['previous_tab','next_tab','left','right'].includes(action)){
    setTab(current=>current==='vehicle'?'concepts':'vehicle');
    return;
   }
   if(action==='up'||action==='down'){scroll.current?.scrollBy({top:action==='up'?-180:180,behavior:'smooth'});return;}
   if(action==='activate'){
    const active=document.activeElement as HTMLElement|null;
    if(active&&root.current?.contains(active)&&active!==root.current)active.click();
   }
  };
  const panel=(event:Event)=>{
   if(useUIStore.getState().overlay!=='hero_abilities')return;
   event.stopImmediatePropagation();
   navigate((event as CustomEvent<string>).detail);
  };
  const keyboard=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
   const action=({Escape:'back',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyQ:'previous_tab',KeyE:'next_tab',Enter:'activate',Space:'activate'} as Record<string,string>)[event.code];
   if(action){event.preventDefault();event.stopPropagation();if(!event.repeat||action==='up'||action==='down')navigate(action);}
  };
  const node=root.current;
  window.addEventListener('avenlab:panel-action',panel);
  node?.addEventListener('keydown',keyboard);
  return()=>{
   window.removeEventListener('avenlab:panel-action',panel);
   node?.removeEventListener('keydown',keyboard);
  };
 },[]);
 useEffect(()=>scroll.current?.scrollTo({top:0}),[selected,tab]);
 if(!selected)return null;
 return <section ref={root} className="game-ui menu-surface alpha-selection hero-selection hero-ability-guide" role="dialog" aria-modal="true" aria-label="Hero abilities" tabIndex={-1} onKeyDown={trapMenuFocus}>
  <SceneTabHeader title="ABILITIES" compact tabs={GUIDE_TABS} activeTab={tab} onTabChange={setTab} idPrefix="hero-guide" panelId="hero-guide-panel"/>
  <div ref={scroll} className="hero-guide-scroll" tabIndex={0} role="tabpanel" id="hero-guide-panel" aria-labelledby={`hero-guide-tab-${tab}`}>
   {tab==='concepts'?<HeroConceptGallery/>:<HeroAbilityDetails heroId={selected}/>}
  </div>
  <SelectionFooter selectLabel="View" backAction={{onClick:closeHeroGuide,label:"Back to game"}}/>
 </section>;
}
