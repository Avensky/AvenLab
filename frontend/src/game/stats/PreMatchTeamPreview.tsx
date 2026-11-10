import { useMemo } from 'react';
import { modeTeamSize } from '../../store/alpha/alphaStore';
import type { SocialView } from '../../store/social/socialStore';
import { TeamPortraitBadge } from './TeamPortraitBadge';
import { selectedTeamPlayers } from './scoreboardData';

/** Staging shows only the admitted side. The full scoreboard owns team browsing. */
export function PreMatchTeamPreview({ view, selectedHero }: { view: SocialView | null; selectedHero?: string | null }) {
  const active = view?.alpha?.active;
  const players = useMemo(() => selectedTeamPlayers(view, selectedHero), [view, selectedHero]);
  if (!active || (active.team !== 'red' && active.team !== 'blue')) return <p className="scoreboard-team-empty">Waiting for your confirmed team.</p>;
  const size = modeTeamSize(active.mode, active.team_size);
  return (
    <ol className="prematch-team-preview" aria-label="Your team slots">
      {Array.from({ length: size }, (_, index) => {
        const player = players[index];
        return (
          <li key={player?.id ?? index} aria-label={player ? undefined : 'Empty hero slot'}>
            <TeamPortraitBadge player={player} />
            {player && <strong title={player.name}>{player.name}</strong>}
          </li>
        );
      })}
    </ol>
  );
}
