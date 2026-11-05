import { useMotionView } from "../../store/session/networkViews";
import { memo, useEffect, useState } from 'react';
import {HEROES,heroForVehicle} from '../../store/alpha/alphaStore';
import { HeroPortrait } from '../../game/alpha/HeroPortrait';

import { usePreferencesStore } from '../../store/preferences/preferencesStore';
import { showVehicleHealthBar, type HealthBarMode } from '../../store/preferences/healthVisibility';
import { readTeammates, retainTeammateCards, type TeammateCard } from './teammateModel';
import './futuristicHUD.css';

const TeammateRow = memo(function TeammateRow({player, mode}: {player: TeammateCard; mode: HealthBarMode}) {
  const modern=usePreferencesStore(s=>s.hudGroups.futuristic);
  const hero=HEROES.find(h=>h.id===player.hero)??heroForVehicle(player.hero);
  const vehicle=hero?.name??player.hero?.toUpperCase()??'UNKNOWN VEHICLE';
  const status=player.status==='reconnecting'?'RECONNECTING':player.status==='delayed'?'SIGNAL DELAY':
    player.waiting?'SELECTING HERO':player.health?.defeated?'DEFEATED':player.health&&player.health.protection>0?'PROTECTED':'';
  return <li data-team={player.team} data-defeated={player.health?.defeated ?? false}>
    <HeroPortrait hero={player.hero} appearance={player.appearance} cacheOnly />
    <div title={vehicle+' · '+player.name+(status?' · '+status:'')}><strong>{modern?vehicle:player.name}</strong>
      {showVehicleHealthBar(mode, player.team, false) && <div className="teammate-health" role="meter" aria-label={`${player.name} health`} aria-valuemin={0} aria-valuemax={player.health?.max ?? 100} aria-valuenow={player.health?.hp} aria-valuetext={player.health ? `${Math.ceil(player.health.hp)} / ${Math.ceil(player.health.max)}` : 'Unavailable'}><i style={{width: `${player.health ? player.health.hp / player.health.max * 100 : 0}%`}}/></div>}
      <small>{modern?player.name+(status?' · '+status:''):status||vehicle}</small>
    </div>
  </li>;
});

/** Stable squad rows sample only card primitives at4Hz. No live card may decode
 * a GLB or create a portrait GPU context while the world is rendering. */
export function TeammateHUD() {
  const mode = usePreferencesStore(s => s.healthBars);
  const session = useMotionView(s => `${s.connected}:${s.playerId}:${s.getMe()?.room_id ?? ''}:${s.getMe()?.team ?? ''}`);
  const [sample, setSample] = useState(() => ({session, rows: readTeammates()}));
  useEffect(() => {
    const update = () => {
      const next = document.visibilityState === 'hidden' ? [] : readTeammates();
      setSample(previous => {
        const rows = previous.session === session ? retainTeammateCards(previous.rows, next) : next;
        return previous.session === session && previous.rows === rows ? previous : {session, rows};
      });
    };
    update(); const timer = window.setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    return () => {window.clearInterval(timer);document.removeEventListener('visibilitychange', update);};
  }, [session]);
  if (sample.session !== session || sample.rows.length === 0) return null;
  return <section className="teammate-hud" aria-label="Your teammates"><ul>{sample.rows.map(player => <TeammateRow key={player.profileId ?? player.id} player={player} mode={mode}/>)}</ul></section>;
}
