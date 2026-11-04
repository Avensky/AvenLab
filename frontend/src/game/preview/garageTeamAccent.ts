import type {AlphaView} from '../../store/alpha/alphaStore';
import type {MenuScreen} from '../../store/menus/types';
import {GARAGE_LIGHT_COLORS} from '../../theme/garageLighting.ts';

/** Team staging reuses the garage fixture/bloom/reflection pipeline without
 * replacing the player's saved UI palette or any garage effect settings. */
export const TEAM_GARAGE_LIGHT_COLORS={red:'#ff526b',blue:GARAGE_LIGHT_COLORS.navy} as const;
export function garageTeamAccent(screen:MenuScreen,active:AlphaView['active']|undefined):string|null{
 if((screen!=='hero_select'&&screen!=='queue')||active?.mode!=='quickplay')return null;
 return active.team==='red'||active.team==='blue'?TEAM_GARAGE_LIGHT_COLORS[active.team]:null;
}
