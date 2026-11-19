import { memo, useMemo } from "react";
import type { GarageStation } from "../preview/garageStations";
import type { CharacterChoice } from "./characterCatalog";
import { CHARACTER_PERSONALITIES, type CharacterPersonality } from "./characterPersonality";
import { COCKPIT_TAKES, cockpitTakesForWheel } from "./cockpitEmotes";
import { FitBadge } from "./FitReview";
import { EMOTE_GROUPS, emoteCollection, findGaragePreviewEmote, garagePreviewCollection, type EmoteGroup } from "./garageEmotes";
import { GARAGE_LEAN_ID, GARAGE_LEAN_NAME } from "./garageLean";
import { MIRROR_MAKEUP_EMOTES } from "./mirrorCheck";

export type PreviewEmoteGroup = EmoteGroup | CharacterPersonality | "Best" | "All" | "Personality";
export type PreviewEmote = { id: string; name: string };

export const CharacterEmoteList = memo(function CharacterEmoteList({
  choice, group, search, station, insideCar, disabled, mirrorAvailable, leanAvailable, selectedId, onSearch, onSelect,
}: {
  choice: CharacterChoice;
  group?: PreviewEmoteGroup;
  search: string;
  station: GarageStation | null;
  insideCar: boolean;
  disabled: boolean;
  mirrorAvailable: boolean;
  leanAvailable: boolean;
  selectedId?: string;
  onSearch: (search: string) => void;
  onSelect: (emote: PreviewEmote) => void;
}) {
  const bag = Boolean(choice.prop);
  const road = station?.kind === "wheel";
  const personality = CHARACTER_PERSONALITIES.find(item =>
    item.id === (group === "Personality" ? choice.appearance?.personality ?? "friendly" : group));
  const label = insideCar ? (road ? "Driving emotes" : "Station emotes") : `${personality?.label ?? group} emotes`;
  const picked = useMemo<readonly PreviewEmote[]>(() => {
    if (insideCar) {
      if (!road) return COCKPIT_TAKES.filter(take => take.id === "086").map(take => ({ ...take, name: "Check surroundings" }));
      return cockpitTakesForWheel(Boolean(station.steeringParts), Boolean(station.drivingSet));
    }
    if (personality) return personality.emotes.flatMap(id => findGaragePreviewEmote(id, bag) ?? []);
    if (group === "All") return [...new Map(EMOTE_GROUPS.flatMap(group => emoteCollection(group, bag)).map(item => [item.id, item])).values()];
    if (group === "Best" || EMOTE_GROUPS.includes(group as EmoteGroup)) return garagePreviewCollection(group as EmoteGroup | "Best", bag);
    return [];
  }, [insideCar, group, bag, road, station, personality]);
  const query = search.trim().toLowerCase();
  const visible = [
    ...(!insideCar && mirrorAvailable && (group === "Garage" || group === "All") ? MIRROR_MAKEUP_EMOTES : []),
    ...(!insideCar && leanAvailable && group === "Garage" ? [{ id: GARAGE_LEAN_ID, name: GARAGE_LEAN_NAME }] : []),
    ...picked,
  ].filter(item => `${item.id} ${item.name}`.toLowerCase().includes(query));

  return <>
    <h2>{label}</h2>
    <div className="character-emote-results">
      <label className="character-emote-search" data-controller-row>Search emotes<input type="search" className="menu-control" value={search}
        placeholder="Name or number…" onChange={event => onSearch(event.target.value)} /></label>
      <small>{visible.length} emotes</small>
      <div className="character-emotes" aria-label={label}>
        {visible.map(item => <button key={item.id} type="button" className="menu-control" data-controller-row data-emote-id={item.id}
          disabled={disabled} aria-pressed={selectedId === item.id} onClick={() => onSelect(item)}>
          <span className="emote-name">{item.name}</span><FitBadge choice={choice} pose={item.id} />
        </button>)}
      </div>
      {!visible.length && <p role="status">No emotes match this filter.</p>}
    </div>
  </>;
});
