import type { ReactNode } from "react";
import { ProgressBadge } from "../alpha/ProgressBadge";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { canEditCharacter, useUIStore } from "../../store/menus/uiStore";
import { characterLook, DEFAULT_CHARACTER } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";

export type CharacterHeaderProfileProps = {
  onOpen?: () => void;
  leadingAction?: ReactNode;
  active?: boolean;
  showProgress?: boolean;
  readOnly?: boolean;
  compact?: boolean;
};

export function CharacterHeaderProfile({ onOpen, leadingAction, active, showProgress = false, readOnly = false, compact = false }: CharacterHeaderProfileProps) {
  const choice = useSocialStore(selectEquippedCharacter) ?? DEFAULT_CHARACTER;
  const editingAllowed = useUIStore(canEditCharacter);
  const name = characterLook(choice)?.character.name ?? "Choose character";
  const content = <>
    <span className="character-header-info">{showProgress ? <ProgressBadge compact /> : name}</span>
    <span className="character-header-portrait" aria-hidden="true"><CharacterPortrait choice={choice} compact /></span>
  </>;
  if (editingAllowed && onOpen && !readOnly) return (
    <div className="character-header-action" data-controller-row data-controller-header-action
      role={leadingAction ? "group" : undefined} aria-label={leadingAction ? "Customization" : undefined}>
      {leadingAction}
      <button type="button" className="character-header-profile" data-compact={compact || undefined} data-open-character data-selection-action
        aria-label="Edit character" aria-current={active ? "page" : undefined} title={`Edit character · ${name}`}
        onClick={() => { if (canEditCharacter()) onOpen(); }}>
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
