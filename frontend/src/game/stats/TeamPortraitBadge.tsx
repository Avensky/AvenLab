import { HeroPortrait } from "../alpha/HeroPortrait";
import type { ScoreboardPlayer } from "./scoreboardData";
import "./teamLineup.css";

export function TeamPortraitBadge({ player }: { player?: ScoreboardPlayer }) {
  return (
    <span className="team-portrait-badge menu-panel-frame" data-self={player?.self} data-empty={!player}>
      {player ? (
        <HeroPortrait hero={player.hero} appearance={player.appearance} showStyleStatus={false} />
      ) : (
        <span className="team-portrait-ellipsis" aria-hidden="true">...</span>
      )}
    </span>
  );
}
