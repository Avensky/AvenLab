import { ProgressBadge } from "../alpha/ProgressBadge";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import { isMatchMode } from "../../store/alpha/alphaStore";
import { openCharacterEditor } from "../../worldBuilder/characterEditor/characterEditorStore";
import { characterLook, DEFAULT_CHARACTER } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";

export type CharacterHeaderProfileProps = {
  onOpen?: () => void;
  showProgress?: boolean;
  readOnly?: boolean;
  compact?: boolean;
};

export function CharacterHeaderProfile({ onOpen, showProgress = false, readOnly = false, compact = false }: CharacterHeaderProfileProps) {
  const choice = useSocialStore(selectEquippedCharacter) ?? DEFAULT_CHARACTER;
  const driving = useUIStore(state => state.screen === "sandbox" && state.overlay !== "world_builder");
  const inMatch = useSocialStore(state => isMatchMode(state.view?.alpha?.active?.mode ?? ""));
  const name = characterLook(choice)?.character.name ?? "Choose character";
  const content = <>
    <span className="character-header-info">{showProgress ? <ProgressBadge compact /> : name}</span>
    <span className="character-header-portrait" aria-hidden="true"><CharacterPortrait choice={choice} compact /></span>
  </>;
  if (!readOnly && (!(driving && inMatch) || onOpen)) return (
    <div className="character-header-action" data-controller-row data-controller-header-action>
      <button type="button" className="character-header-profile" data-compact={compact || undefined} data-open-character data-selection-action
        aria-label="Edit character" title={`Edit character · ${name}`} onClick={onOpen ?? openCharacterEditor}>
        {content}
      </button>
    </div>
  );
  return (
    <div className="character-header-profile" data-compact={compact || undefined} role="group" aria-label={name} title={name}>
      {content}
    </div>
  );
}
