import type { ReactNode } from "react";
import { MenuShortcuts, ControllerAction } from "../../components/controller";
import { ProgressBadge } from "./ProgressBadge";
/** Play and Heroes share the same themed/mobile/Xbox frame. */
export function SelectionHeader({title,onBack,busy=false}:{title:string;onBack:()=>void;busy?:boolean}) {
 return <header className="alpha-header"><div><small>REDLINE VECTOR · ALPHA</small><h1>{title}</h1></div><ProgressBadge/><ControllerAction button="B" type="button" className="menu-control" disabled={busy} onClick={onBack}> BACK</ControllerAction></header>;
}
export function SelectionFooter({children,chat=false,secondaryTabs=false,selectLabel}:{children:ReactNode;chat?:boolean;secondaryTabs?:boolean;selectLabel?:string}) {
 return <footer className="alpha-selection-footer" data-controller-row><MenuShortcuts chat={chat} directions="both" secondaryTabs={secondaryTabs} selectLabel={selectLabel}/>{children}</footer>;
}
