import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type Ref } from "react";
import { ControllerAction } from "../../components/controller";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { CHARACTERS, CHARACTER_APPEARANCE_OPTIONS, CHARACTER_IDENTITIES, DEFAULT_CHARACTER, OUTFIT_THEMES, ROOK_ID, VILLAGER_ID, characterLook, type CharacterStyleField, type CharacterChoice } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";
import { CHARACTER_CAMERAS, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX, useCharacterPreviewStore } from "./characterPreviewStore";
import { EMOTE_GROUPS, garagePreviewCollection, type EmoteGroup } from "./garageEmotes";
import { COCKPIT_TAKES } from "./cockpitEmotes";
import { GARAGE_LEAN_ID, GARAGE_LEAN_NAME } from "./garageLean";

export const CHARACTER_TABS = [
  { id: "identity", label: "Identity" }, { id: "appearance", label: "Appearance" },
  { id: "face", label: "Face" }, { id: "clothes", label: "Clothes" },
  { id: "props", label: "Props" }, { id: "emotes", label: "Emotes" },
] as const;
export type CharacterTab = typeof CHARACTER_TABS[number]["id"];

const LOOK_FIELDS: Record<CharacterStyleField, string> = {
  hair: "Hair", hair_color: "Hair color", skin: "Skin tone", headwear: "Headwear", color: "Outfit color",
  eye_color: "Eye color", brow_color: "Eyebrow tint", glasses: "Glasses",
};
const PREVIEW_CAST = CHARACTERS.map(item => ({ gender: item.gender, choice: { id: item.id, outfit: item.outfits[0].id } }));

function revealCharacterControl(event: FocusEvent<HTMLElement>) {
  event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export function CharacterPage({ onPreview, onReady, tab, beforeClose }: {
  onPreview?: (choice: CharacterChoice | null) => void;
  onReady: (ready: boolean) => void;
  tab: CharacterTab;
  beforeClose: Ref<() => Promise<boolean>>;
}) {
  const owner = useSocialStore(state => state.view?.profile.id);
  const saved = useSocialStore(state => state.view?.profile.progression?.character);
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const [choice, setChoice] = useState(() => characterLook(saved) ? saved! : DEFAULT_CHARACTER);
  const [locked, setLocked] = useState(() => Boolean(characterLook(saved)));
  const [status, setStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [emoteGroup, setEmoteGroup] = useState<EmoteGroup | "Best">("Garage");
  const [comparison, setComparison] = useState<CharacterChoice | null>(null);
  const acknowledged = useRef(locked ? choice : null);
  const queued = useRef<CharacterChoice | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { character, outfit, appearance, fabric, trim } = characterLook(choice)!;
  const { camera, zoom, emote, cockpitAvailable, cockpitError, insideCar, leanAvailable } = useCharacterPreviewStore();
  const previewChoice = useMemo(() => tab === "emotes" && comparison && comparison.id !== choice.id
    ? { ...comparison, prop: choice.prop } : choice, [tab, comparison, choice]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (running.current) return running.current;
    if (!queued.current) return Promise.resolve(true);
    const drain = async () => {
      setStatus("saving");
      while (queued.current) {
        const next = queued.current;
        queued.current = null;
        try {
          if (!owner || useSocialStore.getState().view?.profile.id !== owner) throw Error("Connect your player profile to save.");
          const result = await requestSocial("character_equip", { character: next });
          const confirmed = (result.character as CharacterChoice | undefined) ?? next;
          // The reliable reply can arrive before the replaceable social view.
          useSocialStore.getState().acknowledgeProgression(owner, progression => ({ ...progression, character: confirmed }));
          acknowledged.current = confirmed;
          setLocked(true);
        } catch (error) {
          queued.current ??= next;
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Could not save your character.");
          return false;
        }
      }
      setStatus("saved");
      return true;
    };
    running.current = drain().finally(() => { running.current = null; });
    return running.current;
  }, [owner]);

  useImperativeHandle(beforeClose, () => () => locked ? flush() : Promise.resolve(true), [flush, locked]);
  useLayoutEffect(() => { onPreview?.(previewChoice); }, [previewChoice, onPreview]);
  useLayoutEffect(() => { onReady(locked); }, [locked, onReady]);
  useLayoutEffect(() => {
    if (tab === "emotes") return () => useCharacterPreviewStore.setState({ emote: null, insideCar: false, cockpitError: null });
  }, [tab]);
  useLayoutEffect(() => {
    if (insideCar && (reducedMotion || (locked && tab !== "emotes"))) {
      useCharacterPreviewStore.setState({ insideCar: false, emote: null });
    }
  }, [locked, tab, reducedMotion, insideCar]);
  useLayoutEffect(() => {
    if (!locked || tab !== "face") return;
    const { camera, zoom } = useCharacterPreviewStore.getState();
    useCharacterPreviewStore.setState({ camera: "Face", zoom: 1, emote: null });
    return () => useCharacterPreviewStore.setState({ camera, zoom });
  }, [locked, tab]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    onPreview?.(null);
    onReady(false);
    useCharacterPreviewStore.setState({ camera: "Full body", zoom: 1, emote: null, insideCar: false, cockpitError: null });
  }, [onPreview, onReady]);

  function update(next: CharacterChoice) {
    setChoice(next);
    setMessage("");
    if (!locked) return;
    queued.current = next;
    setStatus("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 300);
  }

  function edit(field: CharacterStyleField, value: string) {
    update({ ...choice, appearance: { ...appearance, [field]: value } });
  }

  function setClothes(color: string, accent: string | undefined) {
    update({ ...choice, appearance: { ...appearance, color, accent } });
  }

  function field(field: CharacterStyleField) {
    return <label key={field}>
      {LOOK_FIELDS[field]}
      <select className="menu-control" aria-label={LOOK_FIELDS[field]} disabled={field === "headwear" && choice.id === VILLAGER_ID}
        value={field === "color" && appearance.color.startsWith("#") ? "custom"
          : appearance[field] ?? (field === "glasses" ? "none" : "original")}
        onChange={event => edit(field, event.target.value)}>
        {field === "color" && appearance.color.startsWith("#") && <option value="custom" disabled>Custom color</option>}
        {CHARACTER_APPEARANCE_OPTIONS[field]
          .filter(item => field !== "headwear" || choice.id !== VILLAGER_ID || item.id === "hat")
          .map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>;
  }

  const palette = <div className="character-appearance character-color-pickers" data-controller-row>
    <label>Fabric<input type="color" aria-label="Clothing fabric color" value={fabric}
      onChange={event => setClothes(event.target.value, appearance.accent)} /></label>
    <label>Accent<input type="color" aria-label="Clothing accent color" value={trim}
      onChange={event => setClothes(appearance.color, event.target.value)} /></label>
    <button type="button" className="menu-control" disabled={appearance.color === "original" && !appearance.accent}
      onClick={() => setClothes("original", undefined)}>Reset colors</button>
  </div>;

  const genderPicker = <div className={locked ? "character-outfits" : "character-cast"} role="group"
    aria-label={locked ? "Preview gender" : "Gender"} data-controller-row>
    {PREVIEW_CAST.map(({ gender, choice: next }) => <button key={next.id} type="button" className="menu-control"
      disabled={!locked && status === "saving"} data-character-option={next.id} aria-pressed={previewChoice.id === next.id}
      onClick={() => {
        if (insideCar) useCharacterPreviewStore.setState({ emote: null });
        if (locked) setComparison(next);
        else update(next);
      }}>
      {!locked && <CharacterPortrait choice={next} compact />}
      <span>{gender === "female" ? "Female" : "Male"}</span>
    </button>)}
  </div>;
  const bag = Boolean(previewChoice.prop);
  const canEnterCar = !bag && !reducedMotion;
  const cockpitPending = insideCar && !cockpitAvailable;
  const pickedEmotes = useMemo(() => insideCar ? COCKPIT_TAKES : garagePreviewCollection(emoteGroup, bag), [insideCar, emoteGroup, bag]);
  function toggleCockpit() {
    useCharacterPreviewStore.setState({ insideCar: !insideCar, emote: null, cockpitError: null, camera: "Full body", zoom: 1 });
  }
  function chooseEmoteGroup(group: EmoteGroup | "Best") {
    setEmoteGroup(group);
    useCharacterPreviewStore.setState({ emote: null });
  }
  const emotePicker = <>
    {!insideCar && <div className="character-outfits" role="group" aria-label="Emote preview" data-controller-row>
      <button type="button" className="menu-control" aria-pressed={emoteGroup === "Best"}
        onClick={() => chooseEmoteGroup("Best")}>Best</button>
      <button type="button" className="menu-control" data-cockpit-toggle disabled={!canEnterCar}
        onClick={toggleCockpit}>Inside car · AE86</button>
    </div>}
    {!insideCar && <div className="character-outfits character-emote-packs" role="group" aria-label="Emote collection" data-controller-row>
      {EMOTE_GROUPS.map(group => <button key={group} type="button" className="menu-control"
        aria-pressed={emoteGroup === group} onClick={() => chooseEmoteGroup(group)}>{group}</button>)}
    </div>}
    {reducedMotion && <p>Emote playback is paused by Reduced Motion.</p>}
    {cockpitError && <p role="status">{cockpitError}</p>}
    {cockpitPending && <p role="status">Preparing the AE86 cockpit…</p>}
    {insideCar && !locked && <button type="button" className="menu-control" data-cockpit-toggle onClick={toggleCockpit}>Exit car</button>}
    {!insideCar && bag && <p>Equip Empty hands to preview inside the car.</p>}
    {bag && pickedEmotes.length === 0 && <p>Equip Empty hands to use these emotes.</p>}
    <div className="character-emotes" aria-label={insideCar ? "Driving emotes" : `${emoteGroup} emotes`}>
      {!insideCar && emoteGroup === "Garage" && leanAvailable && <button type="button" className="menu-control" data-controller-row
        disabled={reducedMotion} aria-pressed={emote?.id === GARAGE_LEAN_ID}
        onClick={() => useCharacterPreviewStore.setState({ emote: { id: GARAGE_LEAN_ID } })}>{GARAGE_LEAN_NAME}</button>}
      {pickedEmotes.map(item => <button key={item.id} type="button" className="menu-control" data-controller-row
        disabled={reducedMotion || cockpitPending}
        aria-pressed={emote?.id === item.id} onClick={() => useCharacterPreviewStore.setState({ emote: { id: item.id } })}>{item.name}</button>)}
    </div>
  </>;

  if (!locked) return (
    <div className="character-page character-page--setup" aria-label="Choose character gender" onFocus={revealCharacterControl}>
      <div className="character-stage" data-character-preview={character.id} data-outfit-preview={outfit.id} />
      <section className="character-controls menu-panel-frame">
        <header className="character-description"><h2>Choose gender</h2><p>This choice is permanent for your profile.</p></header>
        {genderPicker}
        <div className="character-equip" data-controller-row>
          <ControllerAction button="A" className="menu-control" disabled={!owner || saved === undefined || status === "saving"}
            onClick={() => { queued.current = choice; void flush(); }}>
            {status === "saving" ? "Saving…" : `Confirm ${character.gender}`}
          </ControllerAction>
          <p role="status">{message || (!owner ? "Connect your player profile to confirm." : saved === undefined ? "Update the game server to choose a character." : "")}</p>
        </div>
        <h2>Preview emotes</h2>
        {emotePicker}
      </section>
    </div>
  );

  return (
    <div className="character-page character-page--editor" role="tabpanel" id="character-editor-panel" aria-labelledby={"character-editor-tab-" + tab}
      onFocus={revealCharacterControl}>
      <div className="character-stage" data-character-preview={previewChoice.id} data-outfit-preview={previewChoice.outfit}
        aria-label={`Preview of ${characterLook(previewChoice)!.character.name}`} />
      <section className="character-controls menu-panel-frame character-controls--left" aria-label={tab}>
        {tab === "identity" && <>
          <header className="character-description"><h2>Identity</h2><p>Choose how your character identifies. Their model and outfit are separate.</p></header>
          <div className="character-outfits" role="group" aria-label="Character identity" data-controller-row>
            {CHARACTER_IDENTITIES.map(item => <button key={item.id} type="button" className="menu-control"
              aria-pressed={(choice.identity ?? character.gender) === item.id}
              onClick={() => update({ ...choice, identity: item.id })}>{item.label}</button>)}
          </div>
        </>}
        {tab === "appearance" && <header className="character-description"><small>{character.title}</small><h2>{character.name}</h2><p>{character.bio}</p></header>}
        {tab === "face" && <header className="character-description"><h2>Face</h2><p>{character.name}</p></header>}
        {tab === "clothes" && <>
          <h2>Clothes</h2>
          <div className="character-outfits" role="group" aria-label="Outfits" data-controller-row>
            {character.outfits.map(item => <button key={item.id} type="button" className="menu-control" aria-pressed={item.id === outfit.id}
              onClick={() => update({ ...choice, outfit: item.id })}>{item.name}</button>)}
          </div>
          <div className="character-outfits" role="group" aria-label="Clothing themes" data-controller-row>
            {OUTFIT_THEMES.map(theme => <button key={theme.name} type="button" className="menu-control"
              aria-pressed={appearance.color === theme.color && appearance.accent === theme.accent}
              onClick={() => setClothes(theme.color, theme.accent)}>
              <i aria-hidden="true" style={{ "--outfit-jacket": theme.color, "--outfit-trim": theme.accent } as CSSProperties} />{theme.name}
            </button>)}
          </div>
        </>}
        {tab === "props" && <>
          <h2>Props</h2>
          <div className="character-outfits" role="group" aria-label="Props" data-controller-row>
            {([undefined, "shop-bag"] as const).map(prop => <button key={prop ?? "none"} type="button" className="menu-control"
              aria-pressed={choice.prop === prop} onClick={() => { update({ ...choice, prop }); useCharacterPreviewStore.setState({ emote: null }); }}>
              {prop ? "Shop bag" : "Empty hands"}
            </button>)}
          </div>
          <p>Equipping the shop bag unlocks bag emotes in this preview.</p>
        </>}
        {tab === "emotes" && <>
          <h2>{insideCar ? "Driving emotes" : "Preview emotes"}</h2>
          {genderPicker}
          {emotePicker}
        </>}
      </section>
      {(tab === "appearance" || tab === "face" || tab === "clothes") && <section className="character-controls menu-panel-frame character-controls--right" aria-label="Appearance controls">
        {tab === "appearance"
          ? <div className="character-appearance" data-controller-row>
              {(choice.id !== ROOK_ID || !__ROOK_MODEL_URL__) && field("hair")}{field("hair_color")}{field("skin")}
              {(choice.id !== ROOK_ID || !__ROOK_MODEL_URL__) && field("headwear")}
            </div>
          : <div className="character-appearance" data-controller-row>
              {tab === "face" ? [field("eye_color"), field("brow_color"), field("glasses")] : field("color")}
            </div>}
      </section>}
      <section className="character-controls menu-panel-frame character-controls--bottom" aria-label="Color palette, camera and save status">
        {(tab === "appearance" || tab === "clothes") && palette}
        {insideCar ? <div className="character-camera" data-controller-row>
          <label>Camera<select className="menu-control" aria-label="Preview camera" value={camera === "Whole car" ? "Whole car" : "Full body"}
            onChange={event => useCharacterPreviewStore.setState({ camera: event.target.value as typeof camera, zoom: 1 })}>
            <option value="Full body">Driver</option><option>Whole car</option>
          </select></label>
          <button type="button" className="menu-control" data-cockpit-toggle
            onClick={toggleCockpit}>Exit car</button>
        </div> : <div className="character-camera" data-controller-row>
          <label>Camera<select className="menu-control" aria-label="Preview camera" value={camera}
            onChange={event => useCharacterPreviewStore.setState({ camera: event.target.value as typeof camera, zoom: 1 })}>
            {CHARACTER_CAMERAS.map(view => <option key={view}>{view}</option>)}
          </select></label>
          <div className="character-zoom">
            <label>Zoom<input type="range" aria-label="Preview zoom" min={CHARACTER_ZOOM_MIN} max={CHARACTER_ZOOM_MAX} step=".05" value={zoom}
              onChange={event => useCharacterPreviewStore.setState({ zoom: Number(event.target.value) })} /></label>
            <button type="button" className="menu-control" aria-label="Zoom out" disabled={zoom <= CHARACTER_ZOOM_MIN}
              onClick={() => useCharacterPreviewStore.setState({ zoom: Math.max(CHARACTER_ZOOM_MIN, +(zoom - .05).toFixed(2)) })}>−</button>
            <button type="button" className="menu-control" aria-label="Zoom in" disabled={zoom >= CHARACTER_ZOOM_MAX}
              onClick={() => useCharacterPreviewStore.setState({ zoom: Math.min(CHARACTER_ZOOM_MAX, +(zoom + .05).toFixed(2)) })}>+</button>
          </div>
        </div>}
        <div className="character-equip" data-controller-row>
          <p role="status">{status === "error" ? message : status === "saving" || status === "pending" ? "Saving…" : "Changes save automatically."}</p>
          {status === "error" && <>
            <button type="button" className="menu-control" onClick={() => void flush()}>Retry</button>
            <button type="button" className="menu-control" onClick={() => {
              queued.current = null;
              if (acknowledged.current) setChoice(acknowledged.current);
              setStatus("idle");
            }}>Revert unsaved</button>
          </>}
        </div>
      </section>
    </div>
  );
}
