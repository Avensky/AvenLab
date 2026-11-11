import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type Ref } from "react";
import { ControllerAction } from "../../components/controller";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { CHARACTERS, CHARACTER_IDENTITIES, DEFAULT_CHARACTER, characterLook, type CharacterChoice } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";
import { CHARACTER_CAMERAS, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX, useCharacterPreviewStore } from "./characterPreviewStore";
import { EMOTE_GROUPS, garagePreviewCollection, type EmoteGroup } from "./garageEmotes";
import { COCKPIT_TAKES } from "./cockpitEmotes";
import { unlockVehicleAudio } from "../../audio/sharedAudio";
import { GARAGE_STATIONS } from "../preview/garageStations";
import { GARAGE_LEAN_ID, GARAGE_LEAN_NAME } from "./garageLean";
import { DressingRoom } from "./DressingRoom";
import { PreviewVisibilityToggle } from "../preview/PreviewVisibilityToggle";

export const CHARACTER_TABS = [
  { id: "identity", label: "Identity" }, { id: "appearance", label: "Appearance" },
  { id: "emotes", label: "Emotes" },
] as const;
export type CharacterTab = typeof CHARACTER_TABS[number]["id"];

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
  const { character, outfit } = characterLook(choice)!;
  const { camera, zoom, emote, cockpitVehicle, cockpitAvailable, cockpitError, insideCar, leanAvailable } = useCharacterPreviewStore();
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
  const canEnterCar = !reducedMotion;
  const cockpitPending = insideCar && !cockpitAvailable;
  const station = cockpitVehicle ? GARAGE_STATIONS[cockpitVehicle] : null;
  const road = station?.kind === "wheel";
  const stationName = station?.kind === "bridge" ? "bridge" : station?.kind === "levers" ? "driver station" : "cockpit";
  const pickedEmotes = useMemo(() => {
    if (!insideCar) return garagePreviewCollection(emoteGroup, bag);
    if (!road) return COCKPIT_TAKES.filter(take => take.id === "086").map(take => ({ ...take, name: "Check surroundings" }));
    return station.steeringParts ? COCKPIT_TAKES : COCKPIT_TAKES.filter(take => take.id !== "199" && take.id !== "200");
  }, [insideCar, emoteGroup, bag, road, station]);
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
      <button type="button" className="menu-control" data-cockpit-toggle disabled={!canEnterCar || !cockpitVehicle}
        onClick={toggleCockpit}>Enter {stationName}</button>
    </div>}
    {!insideCar && <div className="character-outfits character-emote-packs" role="group" aria-label="Emote collection" data-controller-row>
      {EMOTE_GROUPS.map(group => <button key={group} type="button" className="menu-control"
        aria-pressed={emoteGroup === group} onClick={() => chooseEmoteGroup(group)}>{group}</button>)}
    </div>}
    {reducedMotion && <p>Emote playback is paused by Reduced Motion.</p>}
    {cockpitError && <p role="status">{cockpitError}</p>}
    {cockpitPending && <p role="status">Preparing the {stationName}…</p>}
    {insideCar && !locked && <button type="button" className="menu-control" data-cockpit-toggle onClick={toggleCockpit}>Exit {stationName}</button>}
    {insideCar && bag && <p>Handheld props are stowed while driving.</p>}
    <div className="character-emotes" aria-label={insideCar ? (road ? "Driving emotes" : "Station emotes") : `${emoteGroup} emotes`}>
      {!insideCar && emoteGroup === "Garage" && leanAvailable && <button type="button" className="menu-control" data-controller-row
        disabled={reducedMotion} aria-pressed={emote?.id === GARAGE_LEAN_ID}
        onClick={() => useCharacterPreviewStore.setState({ emote: { id: GARAGE_LEAN_ID } })}>{GARAGE_LEAN_NAME}</button>}
      {pickedEmotes.map(item => <button key={item.id} type="button" className="menu-control" data-controller-row
        disabled={reducedMotion || cockpitPending}
        aria-pressed={emote?.id === item.id} onClick={() => {
          if (item.id === "drive-honk") unlockVehicleAudio();
          useCharacterPreviewStore.setState({ emote: { id: item.id } });
        }}>{item.name}</button>)}
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
    <div className={`character-page character-page--editor${tab === "appearance" ? " character-page--dressing" : ""}`} role="tabpanel" id="character-editor-panel" aria-labelledby={"character-editor-tab-" + tab}
      onFocus={revealCharacterControl}>
      <div className="character-stage" data-character-preview={previewChoice.id} data-outfit-preview={previewChoice.outfit}
        aria-label={`Preview of ${characterLook(previewChoice)!.character.name}`} />
      {tab === "appearance" && <DressingRoom choice={choice} onChange={update} />}
      {tab !== "appearance" && <section className="character-controls menu-panel-frame character-controls--left" aria-label={tab}>
        {tab === "identity" && <>
          <header className="character-description"><h2>Identity</h2><p>Choose how your character identifies. Their model and outfit are separate.</p></header>
          <div className="character-outfits" role="group" aria-label="Character identity" data-controller-row>
            {CHARACTER_IDENTITIES.map(item => <button key={item.id} type="button" className="menu-control"
              aria-pressed={(choice.identity ?? character.gender) === item.id}
              onClick={() => update({ ...choice, identity: item.id })}>{item.label}</button>)}
          </div>
        </>}
        {tab === "emotes" && <>
          <h2>{insideCar ? (road ? "Driving emotes" : "Station emotes") : "Preview emotes"}</h2>
          {genderPicker}
          {emotePicker}
        </>}
      </section>}
      <section className="character-controls menu-panel-frame character-controls--bottom" aria-label="Camera and save status">
        {insideCar ? <div className="character-camera" data-controller-row>
          <label>Camera<select className="menu-control" aria-label="Preview camera" value={camera === "Whole car" ? "Whole car" : "Full body"}
            onChange={event => useCharacterPreviewStore.setState({ camera: event.target.value as typeof camera, zoom: 1 })}>
            <option value="Full body">Driver</option><option value="Whole car">Whole vehicle</option>
          </select></label>
          <button type="button" className="menu-control" data-cockpit-toggle
            onClick={toggleCockpit}>Exit {stationName}</button>
          <PreviewVisibilityToggle />
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
          <PreviewVisibilityToggle />
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
