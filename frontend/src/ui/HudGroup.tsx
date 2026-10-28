import { useState, type ReactNode } from "react";
import { usePreferencesStore, type HudGroupId } from "../store/preferencesStore";

// Hide choices persist; collapsing is local to this HUD mount. All groups can
// be restored from Settings / HUD, including when every driving control is hidden.
export function HudGroup({id,title,children,className="",defaultCollapsed=false}:{id:HudGroupId;title:string;children:ReactNode;className?:string;defaultCollapsed?:boolean}) {
  const visible=usePreferencesStore(s=>s.hudGroups[id]);
  const [collapsed,setCollapsed]=useState(defaultCollapsed);
  if(!visible)return null;
  return <section className={`hud-group ${className}`} data-hud-group={id} data-collapsed={collapsed} aria-label={`${title} group`}>
    <header className="hud-group-header"><button type="button" aria-label={`${collapsed?'Expand':'Collapse'} ${title.toLowerCase()}`} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}><span>{title}</span><i aria-hidden="true">{collapsed?'+':'−'}</i></button>
      <button type="button" className="hud-group-hide" aria-label={`Hide ${title.toLowerCase()}`} title="Restore in Settings / HUD" onClick={()=>usePreferencesStore.getState().setHudGroup(id,false)}>×</button></header>
    {!collapsed&&<div className="hud-group-body">{children}</div>}
  </section>;
}
