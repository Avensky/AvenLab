import type {AlphaView} from '../../store/alpha/alphaStore';
import type {MenuScreen} from '../../store/menus/types';
import {GARAGE_LIGHT_COLORS} from '../../theme/garageLighting.ts';
import {MATCH_TEAM_COLORS} from '../../theme/matchTeamTheme.ts';

/** Team staging reuses the garage fixture/bloom/reflection pipeline without
 * replacing the player's saved UI palette or any garage effect settings. */
export const TEAM_GARAGE_LIGHT_COLORS={red:MATCH_TEAM_COLORS.red.glow,blue:GARAGE_LIGHT_COLORS.navy} as const;
export function garageTeamAccent(screen:MenuScreen,active:AlphaView['active']|undefined):string|null{
 if((screen!=='hero_select'&&screen!=='queue')||!active||!['quickplay','competitive','skirmish'].includes(active.mode))return null;
 return active.team==='red'||active.team==='blue'?TEAM_GARAGE_LIGHT_COLORS[active.team]:null;
}
