import { useMemo } from 'react';
import { HEROES, modeTeamSize } from '../../store/alpha/alphaStore';
import type { SocialView } from '../../store/social/socialStore';
import { MatchTeamComposition } from './MatchPresentation';
import { preMatchPlayers } from './scoreboardData';

/** Staging shows only the admitted side. The full scoreboard owns team browsing. */
export function PreMatchTeamPreview({ view, selectedHero }: { view: SocialView | null; selectedHero?: string | null }) {
  const active = view?.alpha?.active;
  const players = useMemo(() => preMatchPlayers(view).flatMap(row => {
    const member = view?.alpha?.roster.find(card => card.id === row.profileId);
    const confirmed = row.self ? (selectedHero === undefined ? active?.hero : selectedHero) : member?.hero;
    const hero = HEROES.find(item => item.id === confirmed);
    if (!hero || row.heroHidden) return [];
    return [{...row, hero:hero.id, status:'ready' as const,
      appearance:row.self ? view?.profile.progression?.hero_loadouts?.[hero.vehicle] ?? null : member?.appearance ?? null}];
  }), [view, active?.hero, selectedHero]);
  if (!active || (active.team !== 'red' && active.team !== 'blue')) return <p className="scoreboard-team-empty">Waiting for your confirmed team.</p>;
  return <section className="prematch-team-preview" aria-label="Your team slots">
    <div className="prematch-preview-content">
      <MatchTeamComposition players={players} teamSize={modeTeamSize(active.mode, active.team_size)}
        teamFilter={active.team} selectedId={players.find(player => player.self)?.id} compact />
    </div>
  </section>;
}
