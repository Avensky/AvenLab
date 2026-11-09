import {MenuTabButton} from "../../components/menus/MenuTabButton";
import {useEffect,useId,useRef} from 'react';
import {HEROES} from '../../store/alpha/alphaStore';
import {useSocialStore} from '../../store/social/socialStore';
import {useUIStore} from '../../store/menus/uiStore';
import {ControllerAction} from '../../components/controller';
import {HeroPortrait} from '../alpha/HeroPortrait';
import {MenuFrame,MenuFrameHeader,MenuFrameFooter} from '../../components/menus/MenuFrame';
import {useAngledMenuHeader} from '../../components/menus/useAngledMenuHeader';
import {useSelectionNavigation} from '../alpha/useSelectionNavigation';
import {navigateFormRows} from '../social/formRows';
import {CAREER_MODES,selectCareerBucket} from './careerData';
import {CAREER_TABS,useCareerViewStore,type CareerTab} from './careerViewStore';
import {CareerOverview,CareerRecordNotice,CareerStatistics} from './CareerStatistics';
import {CareerHistoryPanel} from './CareerHistoryPanel';
import {CareerTools} from './CareerTools';
import '../alpha/heroSelection.css';
import './career.css';

export function CareerPage(){
 const profile=useSocialStore(state=>state.view?.profile),career=profile?.progression?.career;
 const {tab,mode,hero,selectTab,setMode,setHero}=useCareerViewStore();
 const back=useUIStore(state=>state.backToParentMenu);
 const angled=useAngledMenuHeader();
 const root=useRef<HTMLElement>(null),content=useRef<HTMLDivElement>(null),remembered=useRef(new WeakMap<HTMLElement,number>()),id=useId();
 const heroDefinition=HEROES.find(item=>item.id===(hero==='all'?profile?.progression?.default_hero:hero))??HEROES.find(item=>item.id==='brz')!;
 const bucket=selectCareerBucket(career,mode,hero),hasFilters=['overview','statistics','history'].includes(tab);
 const isActive=()=>{const state=useUIStore.getState();return(state.overlay??state.screen)==='career';};
 const changeTab=(next:CareerTab)=>{selectTab(next);};
 const activate=()=>{if(!isActive())return;const element=document.activeElement as HTMLElement|null;if(element&&root.current?.contains(element)&&element!==root.current&&!element.closest('[data-career-select]'))element.click();else root.current?.querySelector<HTMLElement>('button[role="tab"][aria-selected="true"]')?.focus();};
 useEffect(()=>{root.current?.focus({preventScroll:true});},[]);
 useEffect(()=>{if(content.current)content.current.scrollTop=0;document.getElementById(`${id}-${tab}`)?.scrollIntoView?.({block:'nearest',inline:'nearest'});},[angled,id,tab]);
 useSelectionNavigation(root,{confirm:activate,back:()=>{if(isActive())back();},tab:direction=>{if(!isActive())return;const index=CAREER_TABS.findIndex(item=>item.id===tab);changeTab(CAREER_TABS[(index+direction+CAREER_TABS.length)%CAREER_TABS.length].id);},direction:action=>{
  if(!isActive())return;const active=document.activeElement as HTMLElement|null;
  if(active?.tagName==='SELECT'&&(action==='left'||action==='right')){const select=active as HTMLSelectElement;select.selectedIndex=(select.selectedIndex+(action==='left'?-1:1)+select.options.length)%select.options.length;select.dispatchEvent(new Event('change',{bubbles:true}));}
  else if(root.current)navigateFormRows(root.current,active,action,remembered.current);
 }});
 const navigation=<nav role="tablist" aria-label="Career categories" className={angled?'angled-header-tabs':'career-tabs menu-frame-tabs'} data-controller-row>
  {CAREER_TABS.map(item=><MenuTabButton key={item.id} id={`${id}-${item.id}`} angled={angled} selected={tab===item.id} aria-controls={`${id}-panel`} tabIndex={tab===item.id?0:-1} onClick={()=>changeTab(item.id)}>{item.label}</MenuTabButton>)}
 </nav>;
 return <MenuFrame ref={root} className="game-ui menu-surface tabbed-menu career-page h-full w-full" role="dialog" aria-modal="true" aria-label="Career" tabIndex={-1} data-controller-rows>
  <MenuFrameHeader title="CAREER" eyebrow="" compact={angled} showProgress className={angled?'angled-tab-header':undefined}>
   {angled&&<div className="tabbed-angled-scroll">{navigation}</div>}
  </MenuFrameHeader>
  {!angled&&navigation}
  <div className="career-profile-strip"><span className="career-profile-mark" aria-hidden="true">{profile?.name.slice(0,1).toUpperCase()??'?'}</span><div><h2>{profile?.name??'YOUR CAREER'}</h2><p>{profile?.progression?`LEVEL ${profile.progression.level} · PRESTIGE ${profile.progression.prestige}`:'Connect your player profile'}<span> PLAYER RECORD</span></p></div><span className="career-alpha-tag">ALPHA</span></div>
  {hasFilters&&<div className="career-filters" data-controller-row><label>MODE<select aria-label="Career mode" value={mode} onChange={event=>setMode(event.target.value)}>{CAREER_MODES.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>HERO<select aria-label="Career hero" value={hero} onChange={event=>setHero(event.target.value)}><option value="all">All heroes</option>{HEROES.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><span>YOUR STATS. YOUR STYLE.</span></div>}
  <div ref={content} className="career-content menu-frame-content" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
   {hasFilters?<div className="career-performance-layout"><aside className="career-hero-showcase" aria-label="Selected career hero"><HeroPortrait key={heroDefinition.id} hero={heroDefinition.id} appearance={profile?.progression?.hero_loadouts?.[heroDefinition.vehicle]}/><div><p className="career-eyebrow">{hero==='all'?'ALL HEROES':heroDefinition.role.toUpperCase()}</p><h2>{hero==='all'?'Your garage':heroDefinition.name}</h2><p>{hero==='all'?`${heroDefinition.name} · your main hero`:heroDefinition.note}</p></div></aside><div className="career-performance-main">{tab==='history'?<CareerHistoryPanel owner={profile?.id??null} mode={mode} hero={hero}/>:<><div className="career-section-heading"><div><p className="career-eyebrow">{CAREER_MODES.find(([value])=>value===mode)?.[1].toUpperCase()}</p><h2>{tab==='overview'?'Career overview':'Performance statistics'}</h2></div><span>SERVER RECORD</span></div><CareerRecordNotice career={career} bucket={bucket}/>{tab==='overview'?<CareerOverview bucket={bucket}/>:<CareerStatistics bucket={bucket}/>}</>}</div></div>:<CareerTools key={`${profile?.id}:${tab}`} tab={tab}/>}
  </div>
  <MenuFrameFooter secondaryTabs selectLabel="Select" backAction={{onClick:back}}><div className="career-footer-status">{profile?'SAVED TO YOUR PLAYER':'OFFLINE · CONNECT TO VIEW RECORDS'}</div><ControllerAction button="A" className="menu-control" data-career-select onClick={activate}>SELECT</ControllerAction></MenuFrameFooter>
 </MenuFrame>;
}
