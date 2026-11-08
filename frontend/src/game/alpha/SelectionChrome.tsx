import type { ReactNode } from "react";
import type {MatchTeam} from '../../theme/matchTeamTheme';
import {MenuFrameHeader,MenuFrameFooter} from '../../components/menus/MenuFrame';
/** The same readable chrome as Career and Settings, while the scene remains
 * visible and interactive between the header and footer. */
export function SelectionHeader({title,onBack,busy=false,eyebrow,team,children}:{title:string;onBack:()=>void;busy?:boolean;eyebrow?:string;team?:MatchTeam;children?:ReactNode}) {
 return <MenuFrameHeader title={title} eyebrow={eyebrow} onBack={onBack} busy={busy} variant="scene" team={team}>{children}</MenuFrameHeader>;
}
export function SelectionFooter({children,chat=false,secondaryTabs=false,selectLabel,hasPrimaryAction=false}:{children:ReactNode;chat?:boolean;secondaryTabs?:boolean;selectLabel?:string;hasPrimaryAction?:boolean}) {
 return <MenuFrameFooter chat={chat} secondaryTabs={secondaryTabs} selectLabel={selectLabel} hasPrimaryAction={hasPrimaryAction} variant="scene">{children}</MenuFrameFooter>;
}
