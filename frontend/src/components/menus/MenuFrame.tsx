import {forwardRef,type ComponentPropsWithoutRef,type ReactNode} from 'react';
import {ControllerAction,MenuShortcuts} from '../controller';
import {ProgressBadge} from '../../game/alpha/ProgressBadge';
import './menuFrame.css';

/** Shared full-screen shell. Content and navigation stay with each screen;
 * this frame owns the app-theme, safe areas and compact controller chrome. */
export const MenuFrame=forwardRef<HTMLElement,ComponentPropsWithoutRef<'section'>>(function MenuFrame({className='',children,...props},ref){
 return <section {...props} ref={ref} className={`menu-frame ${className}`}>{children}</section>;
});
export function MenuFrameHeader({title,onBack,titleId,eyebrow='REDLINE VECTOR · ALPHA',backLabel='BACK',busy=false,className=''}:{title:string;onBack:()=>void;titleId?:string;eyebrow?:string;backLabel?:string;busy?:boolean;className?:string}){
 return <header className={`menu-frame-header alpha-header ${className}`}><div><small>{eyebrow}</small><h1 id={titleId}>{title}</h1></div><ProgressBadge/><ControllerAction button="B" type="button" className="menu-control menu-back" disabled={busy} onClick={onBack} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();}}>{backLabel}</ControllerAction></header>;
}
export function MenuFrameFooter({children,status,secondaryTabs=false,selectLabel='Select',className=''}:{children?:ReactNode;status?:ReactNode;secondaryTabs?:boolean;selectLabel?:string;className?:string}){
 return <footer className={`menu-frame-footer alpha-selection-footer ${className}`} data-controller-row data-has-status={Boolean(status)}><MenuShortcuts directions="both" secondaryTabs={secondaryTabs} selectLabel={selectLabel}/>{status&&<p className="menu-frame-status" role="status">{status}</p>}{children}</footer>;
}
