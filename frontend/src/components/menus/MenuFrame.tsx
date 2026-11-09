import {forwardRef,type ComponentPropsWithoutRef,type ReactNode} from 'react';
import {ControllerAction,MenuShortcuts,type BackShortcutAction} from '../controller';
import {ProgressBadge} from '../../game/alpha/ProgressBadge';
import type {MatchTeam} from '../../theme/matchTeamTheme';
import {APP_ALPHA_EYEBROW} from '../../theme/branding';
import './menuFrame.css';

/** Shared full-screen shell. Content and navigation stay with each screen;
 * this frame owns the app-theme, safe areas and compact controller chrome. */
export const MenuFrame=forwardRef<HTMLElement,ComponentPropsWithoutRef<'section'>>(function MenuFrame({className='',children,...props},ref){
 return <section {...props} ref={ref} className={`menu-frame ${className}`}>{children}</section>;
});
export function MenuFrameHeader({
 title,onBack,showBack=true,showProgress=showBack,titleId,eyebrow=APP_ALPHA_EYEBROW,logo,
 backLabel='BACK',busy=false,className='',variant='panel',team,children,titleMeta,
}:{
 title:string;onBack?:()=>void;showBack?:boolean;showProgress?:boolean;titleId?:string;eyebrow?:string;logo?:ReactNode;
 backLabel?:string;busy?:boolean;className?:string;variant?:'panel'|'scene';team?:MatchTeam;children?:ReactNode;titleMeta?:ReactNode;
}){
 return <header className={`menu-frame-header alpha-header ${className}`} data-menu-chrome={variant} data-team-heading={team?true:undefined}>
  <div>{logo??(eyebrow&&<small>{eyebrow}</small>)}<h1 id={titleId}>{title}</h1>{titleMeta}</div>
  {children}
  {team&&<div className="menu-header-team" data-team={team}><strong>{team.toUpperCase()}</strong><span>TEAM</span></div>}
  {(showProgress||showBack)&&<div className="menu-header-actions">
   {showProgress&&<ProgressBadge/>}
   {showBack&&<ControllerAction button="B" type="button" className="menu-control menu-back" disabled={busy} onClick={onBack} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();}}>{backLabel}</ControllerAction>}
  </div>}
 </header>;
}
export function MenuFrameFooter({children,status,secondaryTabs=false,selectLabel='Select',className='',chat=false,variant='panel',hasPrimaryAction=false,backAction}:{children?:ReactNode;status?:ReactNode;secondaryTabs?:boolean;selectLabel?:string;className?:string;chat?:boolean;variant?:'panel'|'scene';hasPrimaryAction?:boolean;backAction?:BackShortcutAction}){
 return <footer className={`menu-frame-footer alpha-selection-footer ${className}`} data-menu-chrome={variant} data-has-status={Boolean(status)}><MenuShortcuts chat={chat} directions="both" secondaryTabs={secondaryTabs} selectLabel={selectLabel} selectAction={!hasPrimaryAction} backAction={backAction}/>{status&&<p className="menu-frame-status" role="status">{status}</p>}{children}</footer>;
}
