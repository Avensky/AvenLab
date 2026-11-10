import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ControllerAction } from "../../components/controller";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { CHARACTERS, CHARACTER_APPEARANCE_OPTIONS, DEFAULT_CHARACTER, OUTFIT_THEMES, VILLAGER_ID, characterAppearance, characterLook, sameCharacterChoice, type CharacterStyleField, type CharacterChoice } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";

const LOOK_FIELDS: Record<CharacterStyleField, string> = {
  hair: "Hair", hair_color: "Hair color", skin: "Skin tone", headwear: "Headwear", color: "Outfit color",
};

const firstChoice = (character: (typeof CHARACTERS)[number]): CharacterChoice => ({
  id: character.id,
  outfit: character.outfits[0].id,
});

export function CharacterPage({ onPreview }: { onPreview?: (choice: CharacterChoice | null) => void }) {
  const owner = useSocialStore(state => state.view?.profile.id);
  const saved = useSocialStore(state => state.view?.profile.progression?.character);
  const [choice, setChoice] = useState(() => saved && CHARACTERS.some(character => character.id === saved.id) && characterLook(saved) ? saved : DEFAULT_CHARACTER);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const { character, outfit, appearance, fabric, trim } = characterLook(choice)!;
  const setClothes = (color: string, accent: string | undefined) =>
    preview({ ...choice, appearance: { ...appearance, color, accent } });
  const equipped = sameCharacterChoice(saved, choice);
  useEffect(() => { onPreview?.(choice); }, [choice, onPreview]);
  useEffect(() => () => onPreview?.(null), [onPreview]);

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
      <div className="character-stage" data-character-preview={character.id} data-outfit-preview={outfit.id} aria-label={`Garage preview of ${character.name}`} />
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
              aria-pressed={item.id === outfit.id} onClick={() => preview({ ...choice, outfit: item.id })}>
              <i aria-hidden="true" style={{ "--outfit-jacket": item.jacket, "--outfit-trim": item.trim } as CSSProperties} />
              {item.name}
            </button>
          ))}
        </div>
        <div className="character-appearance" data-controller-row data-controller-columns="2">
          {(Object.keys(LOOK_FIELDS) as CharacterStyleField[]).map(field => (
            <label key={field}>
              {LOOK_FIELDS[field]}
              <select className="menu-control" aria-label={LOOK_FIELDS[field]} disabled={saving || (field === "headwear" && choice.id === VILLAGER_ID)} value={field === "color" && appearance.color.startsWith("#") ? "custom" : appearance[field]}
                onChange={event => preview({ ...choice, appearance: { ...characterAppearance(choice), [field]: event.target.value } })}>
                {field === "color" && appearance.color.startsWith("#") && <option value="custom" disabled>Custom color</option>}
                {CHARACTER_APPEARANCE_OPTIONS[field]
                  .filter(item => field !== "headwear" || choice.id !== VILLAGER_ID || item.id === "hat")
                  .map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="character-outfits" role="group" aria-label="Clothing themes" data-controller-row>
          {OUTFIT_THEMES.map(theme => <button key={theme.name} type="button" className="menu-control" disabled={saving}
            aria-pressed={appearance.color === theme.color && appearance.accent === theme.accent}
            onClick={() => setClothes(theme.color, theme.accent)}>
            <i aria-hidden="true" style={{ "--outfit-jacket": theme.color, "--outfit-trim": theme.accent } as CSSProperties} />
            {theme.name}
          </button>)}
        </div>
        <div className="character-appearance character-color-pickers" data-controller-row data-controller-columns="2">
          <label>Fabric<input type="color" aria-label="Clothing fabric color" disabled={saving}
            value={fabric} onChange={event => setClothes(event.target.value, appearance.accent)} /></label>
          <label>Accent<input type="color" aria-label="Clothing accent color" disabled={saving}
            value={trim} onChange={event => setClothes(appearance.color, event.target.value)} /></label>
          <button type="button" className="menu-control" disabled={saving || (appearance.color === "original" && !appearance.accent)}
            onClick={() => setClothes("original", undefined)}>Reset clothing colors</button>
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
