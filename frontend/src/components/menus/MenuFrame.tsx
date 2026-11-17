import {forwardRef,type ComponentPropsWithoutRef,type ReactNode} from 'react';
import {MenuShortcuts,type BackShortcutAction} from '../controller';
import {useMenuInputDevice} from '../controller/useMenuInputDevice';
import {ProgressBadge} from '../../game/alpha/ProgressBadge';
import {CharacterHeaderProfile,type CharacterHeaderProfileProps} from '../../game/characters/CharacterHeaderProfile';
import type {MatchTeam} from '../../theme/matchTeamTheme';
import {APP_ALPHA_EYEBROW} from '../../theme/branding';
import {MenuIcon} from './MenuIcon';
import './menuFrame.css';
import './sceneTabHeader.css';

/** Shared full-screen shell. Content and navigation stay with each screen;
 * this frame owns the app-theme, safe areas and compact controller chrome. */
export const MenuFrame=forwardRef<HTMLElement,ComponentPropsWithoutRef<'section'>>(function MenuFrame({className='',children,...props},ref){
 return <section {...props} ref={ref} className={`menu-frame ${className}`}>{children}</section>;
});
export function MenuBackButton({label,children,className='',...props}:ComponentPropsWithoutRef<'button'>&{label:string}){
 return <button type="button" className={`menu-back-button ${className}`} aria-label={label} title={label} {...props}>
  <MenuIcon name="back"/>
  {children&&<span>{children}</span>}
 </button>;
}
export function MenuHeaderBack({onClick,disabled,label='Back'}:BackShortcutAction){
 return <MenuBackButton className="menu-header-back" data-header-back label={label}
  onClick={onClick} disabled={disabled}
  onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();}}/>;
}
export function MenuFrameHeader({
 title,showProgress=false,titleId,compact=false,eyebrow=compact?'':APP_ALPHA_EYEBROW,
 className='',variant='panel',team,children,titleTeam,actions,character,backAction,
}:{
 title:string;showProgress?:boolean;titleId?:string;compact?:boolean;eyebrow?:string;
 className?:string;variant?:'panel'|'scene';team?:MatchTeam;children?:ReactNode;titleTeam?:MatchTeam;actions?:ReactNode;
 character?:CharacterHeaderProfileProps;
 backAction:BackShortcutAction;
}){
 return <header className={`menu-frame-header alpha-header ${compact?'menu-frame-header--compact':''} ${className}`} data-menu-chrome={variant} data-team-heading={team?true:undefined}>
  <div className="menu-frame-title" data-title-team={titleTeam}><MenuHeaderBack {...backAction}/>{eyebrow&&<small>{eyebrow}</small>}<h1 id={titleId}>{title}</h1></div>
  {children}
  {team&&<div className="menu-header-team" data-team={team}><strong>{team.toUpperCase()}</strong><span>TEAM</span></div>}
  <div className="menu-header-actions">
   {actions}
   {showProgress&&<ProgressBadge/>}
   <CharacterHeaderProfile compact={showProgress} {...character}/>
  </div>
 </header>;
}
export function MenuFooter({className = '', ...props}: ComponentPropsWithoutRef<'footer'>) {
 const inputDevice = useMenuInputDevice();
 return <footer {...props} className={`menu-footer ${className}`} data-input-device={inputDevice} />;
}

export function MenuFrameFooter({children,status,tabs=true,secondaryTabs=false,selectLabel='Select',className='',chat=false,variant='panel',hasPrimaryAction=false,backAction}:{children?:ReactNode;status?:ReactNode;tabs?:boolean;secondaryTabs?:boolean;selectLabel?:string;className?:string;chat?:boolean;variant?:'panel'|'scene';hasPrimaryAction?:boolean;backAction?:BackShortcutAction}){
 return <MenuFooter className={`menu-frame-footer alpha-selection-footer ${className}`} data-menu-chrome={variant}>
  <MenuShortcuts chat={chat} directions="both" tabs={tabs} secondaryTabs={secondaryTabs} selectLabel={selectLabel} selectAction={!hasPrimaryAction} backAction={backAction}/>
  {status&&<p className="menu-frame-status" role="status">{status}</p>}
  {children}
 </MenuFooter>;
}
