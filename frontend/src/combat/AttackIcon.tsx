export type AttackSymbol='cannon'|'coax'|'fire'|'lock'|'unlock'|'reset'|'scope'|'ram';
const paths:Record<AttackSymbol,string>={
 cannon:'M4 17h16M7 17v-5h8v5M12 12V8l8-4 2 3-8 4M5 20h2m9 0h3',
 coax:'M7 19V8l2-4 2 4v11H7m7 0V8l2-4 2 4v11h-4M7 15h4m3 0h4',
 fire:'m12 2 2 6 6-2-3 6 5 3-6 1-1 6-4-5-6 3 2-6-5-3 7-1z',
 lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
 unlock:'M7 10V7a5 5 0 0 1 9-3M5 10h14v11H5zM12 14v3',
 reset:'M5 7a8 8 0 1 1-1 9M5 2v6h6M12 8v9m-3-6 3-3 3 3',
 scope:'M12 1v6m0 10v6M1 12h6m10 0h6M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M11 12h2',
 ram:'m5 19 7-7-7-7m7 14 7-7-7-7',
};
export function AttackIcon({kind}:{kind:AttackSymbol}){return <svg className="attack-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]}/></svg>;}
