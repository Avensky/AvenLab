import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type {MatchTeam} from '../../theme/matchTeamTheme';
import {MenuFrameHeader,MenuFrameFooter} from '../../components/menus/MenuFrame';
import {useAngledMenuHeader} from '../../components/menus/useAngledMenuHeader';
import type {CharacterHeaderProfileProps} from '../characters/CharacterHeaderProfile';
/** The same readable chrome as Career and Settings, while the scene remains
 * visible and interactive between the header and footer. */
export function SelectionHeader({title,eyebrow,team,children,compact=false,character}:{title:string;eyebrow?:string;team?:MatchTeam;children?:ReactNode;compact?:boolean;character?:CharacterHeaderProfileProps}) {
 const angled=useAngledMenuHeader()&&compact;
 return <MenuFrameHeader title={title} eyebrow={eyebrow} compact={compact}
  className={angled?'angled-tab-header':undefined} variant="scene" team={team} character={character}>{children}</MenuFrameHeader>;
}
export function SelectionFooter(props: Omit<ComponentPropsWithoutRef<typeof MenuFrameFooter>, 'variant'>) {
 return <MenuFrameFooter {...props} variant="scene"/>;
}
