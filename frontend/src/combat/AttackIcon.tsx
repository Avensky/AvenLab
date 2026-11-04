export type AttackSymbol='cannon'|'coax'|'roof-gun'|'forward-gun'|'fire'|'lock'|'unlock'|'reset'|'scope'|'ram'|'boost'|'heat'|'stun'|'repair'|'shield';
const paths:Record<AttackSymbol,string>={
 shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6',
 boost:'m13 2-8 12h6l-1 8 9-13h-6z',
 heat:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v10m-1 0h2',
 stun:'m6 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1zM17 5l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM6 15h12m-10 4h8',
 repair:'M14 4a5 5 0 0 0-6 6L2 16a3 3 0 0 0 4 4l6-6a5 5 0 0 0 6-6l-3 3-3-3z',
 cannon:'M4 17h16M7 17v-5h8v5M12 12V8l8-4 2 3-8 4M5 20h2m9 0h3',
 'roof-gun':'M3 15h18M7 15v-4h8v4M11 11V7h10M11 7H6m10 4 3-4M9 18h6',
 'forward-gun':'M3 9h11v6H3zM14 10h8m-8 4h8M6 15v5m4-5v5M6 6h4',
 coax:'M7 19V8l2-4 2 4v11H7m7 0V8l2-4 2 4v11h-4M7 15h4m3 0h4',
 fire:'m12 2 2 6 6-2-3 6 5 3-6 1-1 6-4-5-6 3 2-6-5-3 7-1z',
 lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
 unlock:'M7 10V7a5 5 0 0 1 9-3M5 10h14v11H5zM12 14v3',
 reset:'M5 7a8 8 0 1 1-1 9M5 2v6h6M12 8v9m-3-6 3-3 3 3',
 scope:'M12 1v6m0 10v6M1 12h6m10 0h6M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M11 12h2',
 ram:'m5 19 7-7-7-7m7 14 7-7-7-7',
};
export function AttackIcon({kind}:{kind:AttackSymbol}){return <svg className="attack-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]}/></svg>;}
