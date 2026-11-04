import type {HeroAppearance} from '../../vehicles/cosmetics/heroLoadouts';

/** These read-only contracts mirror the server's persisted career records.
 * Display components never manufacture wins, awards, XP or personal bests. */
export type CareerOutcome='win'|'loss'|'draw'|'completed'|'abandoned';
export type CareerTeam='red'|'blue';
export type CareerAward='mvp'|'svp'|'play_of_the_game'|'top_support';
export type CareerStats={
 kills:number;deaths:number;assists:number;resurrections:number;respawns:number;
 captures:number;flag_returns:number;damage_dealt:number;healing_done:number;
 self_healing:number;gas_burned_liters:number;gas_gained_liters:number;
 play_time_s:number;best_kill_streak:number;
};
export type CareerBucket={
 sessions:number;matches:number;wins:number;losses:number;draws:number;abandoned:number;
 totals:CareerStats;best:CareerStats;mvp:number;svp:number;play_of_the_game:number;top_support:number;
};
export type CareerHistoryEntry={
 match_id:string;mode:string;map:string;ended_at:number;duration_s:number;training:boolean;
 outcome:CareerOutcome;hero:string;team:CareerTeam|null;stats:CareerStats;
 awards:CareerAward[];abandoned:boolean;
};
export type CareerSummary={
 version:number;summary:CareerBucket;by_mode:Record<string,CareerBucket>;
 by_hero:Record<string,CareerBucket>;by_mode_hero?:Record<string,Record<string,CareerBucket>>;
 recent:CareerHistoryEntry[];
};
export type CareerParticipant={
 profile_id:string;name:string;team:CareerTeam|null;hero:string;appearance:HeroAppearance;
 stats:CareerStats;abandoned:boolean;awards:CareerAward[];
 outcome?:CareerOutcome;level?:number;
};
export type CareerPlayOfGame={
 profile_id:string;start_s:number;end_s:number;score:number;
 kills:number;captures:number;damage:number;description?:string;replay_available?:boolean;
};
export type CareerMatch={
 match_id:string;world_id:number;mode:string;map:string;ended_at:number;duration_s:number;
 training:boolean;progression_eligible:boolean;winner:CareerTeam|null;score:[number,number];participants:CareerParticipant[];
 play_of_game:CareerPlayOfGame|null;
};
export type CareerHistoryPage={matches:CareerHistoryEntry[];next_cursor:string|null};
