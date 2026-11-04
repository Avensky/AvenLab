import type {CareerBucket,CareerSummary} from './careerTypes';
import {CAREER_STATS,careerAverage,formatCareerValue} from './careerData';

export function CareerRecordNotice({career,bucket}:{career:CareerSummary|undefined;bucket:CareerBucket|undefined}) {
 if(!career)return <p className="career-notice">Match records start with this update. Earlier progression is preserved; historical performance has not been reconstructed.</p>;
 if(!bucket)return <p className="career-notice">This server does not have combined mode and hero statistics yet. Select All modes or All heroes.</p>;
 return <p className="career-record-note">{formatCareerValue(bucket.sessions)} recorded sessions · {formatCareerValue(bucket.matches)} completed matches{bucket.abandoned>0?` · ${formatCareerValue(bucket.abandoned)} left early`:''}. Training is included in All modes; its results have a separate mode bucket and grant no XP or ranked progression.</p>;
}

export function CareerOverview({bucket}:{bucket:CareerBucket|undefined}) {
 const record=bucket?bucket.wins+bucket.losses+bucket.draws:0;
 const metrics=[
  ['Sessions',bucket?.sessions,'Every recorded session'],
  ['Matches won',bucket?.wins,bucket?`${bucket.losses} losses · ${bucket.draws} draws`:'Verified match results'],
  ['Win rate',bucket&&record>0?`${Math.round(bucket.wins/record*100)}%`:'—','Completed matches only'],
  ['Most damage',bucket?.best.damage_dealt,'Personal best · one session'],
  ['Most eliminations',bucket?.best.kills,'Personal best · one session'],
  ['Best streak',bucket?.best.best_kill_streak,'Consecutive eliminations'],
 ] as const;
 return <div className="career-overview"><div className="career-metrics">{metrics.map(([label,value,note])=><article key={label}><span>{label}</span><strong>{typeof value==='string'?value:formatCareerValue(value)}</strong><small>{note}</small></article>)}</div><section className="career-awards" aria-label="Career awards"><div><strong>{formatCareerValue(bucket?.mvp)}</strong><span>MVP</span></div><div><strong>{formatCareerValue(bucket?.svp)}</strong><span>SVP</span></div><div><strong>{formatCareerValue(bucket?.play_of_the_game)}</strong><span>Play of the game</span></div><div><strong>{formatCareerValue(bucket?.top_support)}</strong><span>Top support</span></div></section><div className="career-overview-bottom"><div><span>TIME PLAYED</span><strong>{formatCareerValue(bucket?.totals.play_time_s,'duration')}</strong></div><div><span>TOTAL DAMAGE</span><strong>{formatCareerValue(bucket?.totals.damage_dealt)}</strong></div><div><span>TOTAL HEALING</span><strong>{formatCareerValue(bucket?.totals.healing_done)}</strong></div></div></div>;
}

export function CareerStatistics({bucket}:{bucket:CareerBucket|undefined}) {
 const averageLabel=bucket&&bucket.sessions===bucket.matches?'Avg / match':'Avg / session';
 return <div className="career-statistics"><table><caption className="sr-only">Recorded career performance. Best is the highest value in one session.</caption><thead><tr><th scope="col">Statistic</th><th scope="col">Total</th><th scope="col">Best</th><th scope="col">{averageLabel}</th></tr></thead><tbody>{CAREER_STATS.map(row=><tr key={row.key}><th scope="row">{row.label}</th><td>{formatCareerValue(row.kind==='maximum'?undefined:bucket?.totals[row.key],row.kind)}</td><td>{formatCareerValue(bucket?.best[row.key],row.kind)}</td><td>{formatCareerValue(careerAverage(bucket,row.key),row.kind,true)}</td></tr>)}</tbody></table><p className="career-record-note">Best values are individual session records. A streak is a maximum, so it has no total or average.</p></div>;
}
