import type { ReactNode } from "react";
import type {MatchTeam} from '../../theme/matchTeamTheme';
import {MenuFrameHeader,MenuFrameFooter} from '../../components/menus/MenuFrame';
/** The same readable chrome as Career and Settings, while the scene remains
 * visible and interactive between the header and footer. */
export function SelectionHeader({title,onBack,busy=false,eyebrow,team}:{title:string;onBack:()=>void;busy?:boolean;eyebrow?:string;team?:MatchTeam}) {
 return <MenuFrameHeader title={title} eyebrow={eyebrow} onBack={onBack} busy={busy} variant="scene" team={team}/>;
}
export function SelectionFooter({children,chat=false,secondaryTabs=false,selectLabel}:{children:ReactNode;chat?:boolean;secondaryTabs?:boolean;selectLabel?:string}) {
 return <MenuFrameFooter chat={chat} secondaryTabs={secondaryTabs} selectLabel={selectLabel} variant="scene">{children}</MenuFrameFooter>;
}
