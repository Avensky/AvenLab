import { ProgressBadge } from "../alpha/ProgressBadge";
import { useSocialStore } from "../../store/social/socialStore";
import { characterLook } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";

export function CharacterHeaderProfile({ onOpen, showProgress = false }: {
  onOpen?: () => void;
  showProgress?: boolean;
}) {
  const choice = useSocialStore(state => state.view?.profile.progression?.character);
  const name = characterLook(choice)?.character.name ?? "Choose character";
  const portrait = <span className="character-header-portrait"><CharacterPortrait choice={choice} compact /></span>;
  if (onOpen) return (
    <div data-controller-row>
      <button type="button" className="character-header-profile" data-open-character onClick={onOpen}>
        <span className="character-header-info">{name}</span>
        {portrait}
      </button>
    </div>
  );
  return (
    <div className="character-header-profile">
      <div className="character-header-info">
        {showProgress ? <ProgressBadge compact /> : name}
      </div>
      {portrait}
    </div>
  );
}
