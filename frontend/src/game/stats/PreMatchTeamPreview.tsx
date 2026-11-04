import { useMemo } from 'react';
import { modeTeamSize } from '../../store/alpha/alphaStore';
import type { SocialView } from '../../store/social/socialStore';
import { MatchTeamComposition } from './MatchPresentation';
import { preMatchPlayers } from './scoreboardData';

/** Staging shows only the admitted side. The full scoreboard owns team browsing. */
export function PreMatchTeamPreview({ view }: { view: SocialView | null }) {
  const active = view?.alpha?.active;
  const players = useMemo(() => preMatchPlayers(view), [view]);
  if (!active || (active.team !== 'red' && active.team !== 'blue')) return <p className="scoreboard-team-empty">Waiting for your confirmed team.</p>;
  return <section className="prematch-team-preview" aria-label="Your team slots">
    <div className="prematch-preview-content">
      <MatchTeamComposition players={players} teamSize={modeTeamSize(active.mode, active.team_size)}
        teamFilter={active.team} selectedId={players.find(player => player.self)?.id} compact />
    </div>
  </section>;
}
