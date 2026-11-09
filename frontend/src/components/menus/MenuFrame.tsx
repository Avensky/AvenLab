import {forwardRef,type ComponentPropsWithoutRef,type ReactNode} from 'react';
import {MenuShortcuts,type BackShortcutAction} from '../controller';
import {useMenuInputDevice} from '../controller/useMenuInputDevice';
import {ProgressBadge} from '../../game/alpha/ProgressBadge';
import type {MatchTeam} from '../../theme/matchTeamTheme';
import {APP_ALPHA_EYEBROW} from '../../theme/branding';
import './menuFrame.css';
import './sceneTabHeader.css';

/** Shared full-screen shell. Content and navigation stay with each screen;
 * this frame owns the app-theme, safe areas and compact controller chrome. */
export const MenuFrame=forwardRef<HTMLElement,ComponentPropsWithoutRef<'section'>>(function MenuFrame({className='',children,...props},ref){
 return <section {...props} ref={ref} className={`menu-frame ${className}`}>{children}</section>;
});
export function MenuFrameHeader({
 title,showProgress=false,titleId,compact=false,eyebrow=compact?'':APP_ALPHA_EYEBROW,logo,
 className='',variant='panel',team,children,titleTeam,actions,
}:{
 title:string;showProgress?:boolean;titleId?:string;compact?:boolean;eyebrow?:string;logo?:ReactNode;
 className?:string;variant?:'panel'|'scene';team?:MatchTeam;children?:ReactNode;titleTeam?:MatchTeam;actions?:ReactNode;
}){
 return <header className={`menu-frame-header alpha-header ${compact?'menu-frame-header--compact':''} ${className}`} data-menu-chrome={variant} data-team-heading={team?true:undefined}>
  <div data-title-team={titleTeam}>{logo??(eyebrow&&<small>{eyebrow}</small>)}<h1 id={titleId}>{title}</h1></div>
  {children}
  {team&&<div className="menu-header-team" data-team={team}><strong>{team.toUpperCase()}</strong><span>TEAM</span></div>}
  {(showProgress||actions)&&<div className="menu-header-actions">
   {actions}
   {showProgress&&<ProgressBadge/>}
  </div>}
 </header>;
}
export function MenuFooter({className = '', ...props}: ComponentPropsWithoutRef<'footer'>) {
 const inputDevice = useMenuInputDevice();
 return <footer {...props} className={`menu-footer ${className}`} data-input-device={inputDevice} />;
}

export function MenuFrameFooter({children,status,secondaryTabs=false,selectLabel='Select',className='',chat=false,variant='panel',hasPrimaryAction=false,backAction}:{children?:ReactNode;status?:ReactNode;secondaryTabs?:boolean;selectLabel?:string;className?:string;chat?:boolean;variant?:'panel'|'scene';hasPrimaryAction?:boolean;backAction?:BackShortcutAction}){
 return <MenuFooter className={`menu-frame-footer alpha-selection-footer ${className}`} data-menu-chrome={variant}>
  <MenuShortcuts chat={chat} directions="both" secondaryTabs={secondaryTabs} selectLabel={selectLabel} selectAction={!hasPrimaryAction} backAction={backAction}/>
  {status&&<p className="menu-frame-status" role="status">{status}</p>}
  {children}
 </MenuFooter>;
}
