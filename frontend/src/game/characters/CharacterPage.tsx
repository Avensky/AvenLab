import { useRef, useState, type CSSProperties } from "react";
import { ControllerAction } from "../../components/controller";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { CHARACTERS, characterLook, type CharacterChoice } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";

export function CharacterEntry({ onOpen }: { onOpen: () => void }) {
  const saved = useSocialStore(state => state.view?.profile.progression?.character);
  const look = characterLook(saved);
  return (
    <div className="hero-character-entry" data-controller-row>
      <button type="button" className="hero-character-link menu-panel-frame" data-open-character onClick={onOpen}>
        <CharacterPortrait choice={saved} compact />
        <span><small>Character</small><strong>{look?.character.name ?? "Choose character"}</strong></span>
      </button>
    </div>
  );
}

const firstChoice = (character: (typeof CHARACTERS)[number]): CharacterChoice => ({
  id: character.id,
  outfit: character.outfits[0].id,
});

export function CharacterPage() {
  const owner = useSocialStore(state => state.view?.profile.id);
  const saved = useSocialStore(state => state.view?.profile.progression?.character);
  const [choice, setChoice] = useState(() => saved && characterLook(saved) ? saved : firstChoice(CHARACTERS[0]));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const { character, outfit } = characterLook(choice)!;
  const equipped = saved?.id === choice.id && saved.outfit === choice.outfit;

  function preview(next: CharacterChoice) {
    setChoice(next);
    setMessage("");
  }

  async function equip() {
    if (!owner || saved === undefined || equipped || pending.current || useSocialStore.getState().view?.profile.id !== owner) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    try {
      await requestSocial("character_equip", { character: choice });
      setMessage("Character saved to your profile.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your character.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="character-page" aria-label="Character selection">
      <div className="character-stage menu-panel-frame" data-character-preview={character.id} data-outfit-preview={outfit.id}>
        <CharacterPortrait choice={choice} label={`${character.name} in ${outfit.name}`} />
      </div>
      <section className="character-controls menu-panel-frame" aria-label="Character details"
        onFocus={event => (event.target as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
        <header className="character-description">
          <small>{character.title}</small>
          <h2>{character.name}</h2>
          <p>{character.bio}</p>
        </header>
        <div className="character-cast" role="group" aria-label="Characters" data-controller-row>
          {CHARACTERS.map(item => {
            const look = saved?.id === item.id && characterLook(saved) ? saved : firstChoice(item);
            return <button key={item.id} type="button" className="menu-control" disabled={saving}
              data-character-option={item.id} aria-pressed={item.id === choice.id} onClick={() => preview(look)}>
              <CharacterPortrait choice={item.id === choice.id ? choice : look} compact />
              <span>{item.name}</span>
            </button>;
          })}
        </div>
        <div className="character-outfits" role="group" aria-label="Outfits" data-controller-row>
          {character.outfits.map(item => (
            <button key={item.id} type="button" className="menu-control" disabled={saving}
              aria-pressed={item.id === outfit.id} onClick={() => preview({ id: character.id, outfit: item.id })}>
              <i aria-hidden="true" style={{ "--outfit-jacket": item.jacket, "--outfit-trim": item.trim } as CSSProperties} />
              {item.name}
            </button>
          ))}
        </div>
        <div className="character-equip" data-controller-row>
          <ControllerAction button="A" className="menu-control" onClick={() => void equip()}
            disabled={!owner || saved === undefined || saving || equipped}>
            {saving ? "Saving…" : equipped ? "Equipped" : "Equip character"}
          </ControllerAction>
          <p role="status">{message || (!owner ? "Connect your player profile to equip a character."
            : saved === undefined ? "Update the game server to equip a character."
            : "Your character follows you across vehicles.")}</p>
        </div>
      </section>
    </div>
  );
}
