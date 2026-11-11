import { MIRROR_CHECK_ID, MIRROR_CHECK_NAME } from "./mirrorCheck";
import { useFittingTurnStore } from "./fittingControlsStore";
import { FitBadge, FitReview } from "./FitReview";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type Ref, type ReactNode } from "react";
import { ControllerAction } from "../../components/controller";
import { requestSocial } from "../../net/socialClient";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { CHARACTERS, CHARACTER_IDENTITIES, DEFAULT_CHARACTER, characterAppearance, characterLook, type CharacterChoice } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";
import { CHARACTER_CAMERAS, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX, useCharacterPreviewStore } from "./characterPreviewStore";
import { EMOTE_GROUPS, garagePreviewCollection, emoteCollection, type EmoteGroup } from "./garageEmotes";
import { COCKPIT_TAKES } from "./cockpitEmotes";
import { unlockVehicleAudio } from "../../audio/sharedAudio";
import { GARAGE_STATIONS } from "../preview/garageStations";
import { GARAGE_LEAN_ID, GARAGE_LEAN_NAME } from "./garageLean";
import { CHARACTER_PERSONALITIES, type AnimationFit, type CharacterPersonality } from "./characterPersonality";
import { FittingCameraSelect } from "./FittingCameraSelect";
import { FittingCameraToolbar } from "./FittingCameraToolbar";
import { DressingRoom } from "./DressingRoom";
import { PreviewVisibilityToggle } from "../preview/PreviewVisibilityToggle";

export const CHARACTER_TABS = [
  { id: "identity", label: "Identity" }, { id: "appearance", label: "Appearance" },
  { id: "emotes", label: "Emotes" },
] as const;
export type CharacterTab = typeof CHARACTER_TABS[number]["id"];

const PREVIEW_CAST = CHARACTERS.map(item => ({ gender: item.gender, choice: { id: item.id, outfit: item.outfits[0].id } }));
const COCKPIT_CAMERAS = ["Full body", "Whole car"] as const;

function revealCharacterControl(event: FocusEvent<HTMLElement>) {
  event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export function CharacterPage({ onPreview, onReady, tab, beforeClose, inspection = false, cameraControls }: {
  cameraControls?: ReactNode;
  inspection?: boolean;
  onPreview?: (choice: CharacterChoice | null) => void;
  onReady: (ready: boolean) => void;
  tab: CharacterTab;
  beforeClose: Ref<() => Promise<boolean>>;
}) {
  const page = useRef<HTMLDivElement>(null);
  const owner = useSocialStore(state => state.view?.profile.id ?? state.profileOwner);
  const connectedOwner = useSocialStore(state => state.view?.profile.id);
  const saved = useSocialStore(selectEquippedCharacter);
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const [choice, setChoice] = useState(() => characterLook(saved) ? saved! : DEFAULT_CHARACTER);
  const [trial, setTrial] = useState<CharacterChoice>();
  const [loadedOutfit, setLoadedOutfit] = useState(false);
  const activeTrial = trial?.id === choice.id ? trial : undefined;
  const previewChoice = activeTrial ?? choice;
  const [locked, setLocked] = useState(() => Boolean(characterLook(saved)));
  const [status, setStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [emoteGroup, setEmoteGroup] = useState<EmoteGroup | "Best" | "All" | "Personality">("Garage");
  const [emoteSearch, setEmoteSearch] = useState("");
  const acknowledged = useRef(locked ? choice : null);
  const queued = useRef(new Map<string, CharacterChoice>());
  const drafts = useRef(new Map<string, CharacterChoice>());
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { character, outfit, appearance } = characterLook(previewChoice)!;
  const { camera, zoom, emote, playbackPaused, cockpitVehicle, cockpitAvailable, cockpitError, insideCar, leanAvailable, mirrorAvailable } = useCharacterPreviewStore();

  useLayoutEffect(() => {
    const element = page.current?.querySelector<HTMLElement>("[data-character-viewport]");
    if (!element || typeof ResizeObserver === "undefined") return;
    const updateArea = () => {
      const { left, top, width, height } = element.getBoundingClientRect();
      useCharacterPreviewStore.setState({ viewport: { left, top, width, height } });
    };
    const observer = new ResizeObserver(updateArea);
    observer.observe(element); updateArea();
    return () => { observer.disconnect(); useCharacterPreviewStore.setState({ viewport: null }); };
  }, [locked, tab]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (running.current) return running.current;
    if (!queued.current.size) return Promise.resolve(true);
    const drain = async () => {
      setStatus("saving");
      while (queued.current.size) {
        const [id, next] = queued.current.entries().next().value!;
        queued.current.delete(id);
        try {
          if (!owner || useSocialStore.getState().view?.profile.id !== owner) throw Error("Connect your player profile to save.");
          const result = await requestSocial("character_equip", { character: next });
          const confirmed = (result.character as CharacterChoice | undefined) ?? next;
          useSocialStore.getState().acknowledgeProgression(owner, progression => ({ ...progression, character: confirmed }), result);
          acknowledged.current = useSocialStore.getState().view?.profile.progression?.character ?? confirmed;
          if (drafts.current.get(id) === next) drafts.current.delete(id);
          setLocked(true);
        } catch (error) {
          // Keep another model's pending edits and the order in which the player selected them.
          if (!queued.current.has(id)) queued.current = new Map([[id, next], ...queued.current]);
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Could not save your character.");
          return false;
        }
      }
      if (acknowledged.current) setChoice(acknowledged.current);
      setStatus("saved");
      return true;
    };
    running.current = drain().finally(() => { running.current = null; });
    return running.current;
  }, [owner]);

  useLayoutEffect(() => {
    if (saved && characterLook(saved) && !running.current && !queued.current.size) {
      acknowledged.current = saved;
      setChoice(saved);
      setLocked(true);
    }
  }, [saved]);
  useEffect(() => { if (connectedOwner && queued.current.size) void flush(); }, [connectedOwner, flush]);
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
    setLoadedOutfit(false);
    setTrial(undefined);
    setChoice(next);
    setMessage("");
    if (!locked) return;
    drafts.current.set(next.id, next);
    queued.current.delete(next.id);
    queued.current.set(next.id, next);
    setStatus("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 300);
  }

  function tryOn(next: CharacterChoice) {
    setTrial(loadedOutfit || next.garments || next.wardrobeTrial || next.wardrobeEase || next.removedClothing?.length ? next : undefined);
  }

  function loadOutfit(next: CharacterChoice) {
    setLoadedOutfit(true);
    setTrial(next);
    useCharacterPreviewStore.setState({ camera: "Full body", zoom: 1 });
  }

  function endOutfitPreview() {
    setLoadedOutfit(false);
    setTrial(undefined);
  }

  function editPreviewAppearance(next: CharacterChoice) {
    if (loadedOutfit || next.garments || next.wardrobeTrial || next.wardrobeEase || next.removedClothing?.length) tryOn(next);
    else equipOutfit(next);
  }

  function equipOutfit(next: CharacterChoice) {
    update(activeTrial ? { ...choice, outfit: next.outfit, wardrobe: next.wardrobe } : next);
  }

  const modelPicker = <div className={locked ? "character-outfits" : "character-cast"} role="group"
    aria-label={locked ? "Character model" : "Gender"} data-controller-row>
    {PREVIEW_CAST.map(({ gender, choice: next }) => <button key={next.id} type="button" className="menu-control"
      disabled={!locked && status === "saving"} data-character-option={next.id} aria-pressed={choice.id === next.id}
      onClick={() => {
        if (next.id === choice.id) return;
        useCharacterPreviewStore.setState({ emote: null });
        const state = useSocialStore.getState();
        const progression = state.view?.profile.progression ?? state.cachedCosmetics;
        const preset = drafts.current.get(next.id) ?? (progression?.character?.id === next.id
          ? progression.character : progression?.character_presets?.[next.id]);
        update({ ...(preset && characterLook(preset) ? preset : next), identity: choice.identity });
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
    if (!insideCar) {
      const all = [...new Map(EMOTE_GROUPS.flatMap(group => emoteCollection(group, bag)).map(item => [item.id, item])).values()];
      if (emoteGroup === "All") return all;
      if (emoteGroup === "Personality") {
        const ids: readonly string[] = CHARACTER_PERSONALITIES.find(item => item.id === (appearance.personality ?? "friendly"))!.emotes;
        return all.filter(item => ids.includes(item.id));
      }
      return garagePreviewCollection(emoteGroup, bag);
    }
    if (!road) return COCKPIT_TAKES.filter(take => take.id === "086").map(take => ({ ...take, name: "Check surroundings" }));
    return station.steeringParts ? COCKPIT_TAKES : COCKPIT_TAKES.filter(take => take.id !== "199" && take.id !== "200");
  }, [insideCar, emoteGroup, bag, road, station, appearance.personality]);
  function toggleCockpit() {
    useCharacterPreviewStore.setState({ insideCar: !insideCar, emote: null, cockpitError: null, camera: "Full body", zoom: 1 });
  }
  function chooseEmoteGroup(group: EmoteGroup | "Best" | "All" | "Personality") {
    setEmoteGroup(group); setEmoteSearch("");
    useCharacterPreviewStore.setState({ emote: null });
  }
  const emoteFilters = <>
    {!insideCar && <div className="character-outfits" role="group" aria-label="Emote preview" data-controller-row>
      <button type="button" className="menu-control" aria-pressed={emoteGroup === "Best"}
        onClick={() => chooseEmoteGroup("Best")}>Best</button>
      <button type="button" className="menu-control" data-cockpit-toggle disabled={!canEnterCar || !cockpitVehicle}
        onClick={toggleCockpit}>Enter {stationName}</button>
    </div>}
    {!insideCar && <div className="character-outfits character-emote-packs" role="group" aria-label="Emote collection" data-controller-row>
      {([...EMOTE_GROUPS, "All", "Personality"] as const).map(group => <button key={group} type="button" className="menu-control"
        aria-pressed={emoteGroup === group} onClick={() => chooseEmoteGroup(group)}>{group === "Personality" ? "My personality" : group}</button>)}
    </div>}
    {reducedMotion && <p>Emote playback is paused by Reduced Motion.</p>}
    {cockpitError && <p role="status">{cockpitError}</p>}
    {cockpitPending && <p role="status">Preparing the {stationName}…</p>}
    {insideCar && bag && <p>Handheld props are stowed while driving.</p>}
  </>;
  const visibleEmotes = pickedEmotes.filter(item => `${item.id} ${item.name}`.toLowerCase().includes(emoteSearch.trim().toLowerCase()));
  const emoteResults = <>
    <label className="character-emote-search" data-controller-row>Search emotes<input type="search" className="menu-control" aria-label="Search emotes" value={emoteSearch} placeholder="Name or number…" onChange={event => setEmoteSearch(event.target.value)} /></label>
    <small>{visibleEmotes.length} emotes</small>
    <div className="character-emotes" aria-label={insideCar ? (road ? "Driving emotes" : "Station emotes") : `${emoteGroup} emotes`}>
      {!insideCar && ["Garage", "All"].includes(emoteGroup) && mirrorAvailable && MIRROR_CHECK_NAME.toLowerCase().includes(emoteSearch.toLowerCase()) && <button type="button" className="menu-control" data-controller-row disabled={reducedMotion} aria-pressed={emote?.id === MIRROR_CHECK_ID}
        onClick={() => { useFittingTurnStore.setState({ characterYaw: 0 }); useCharacterPreviewStore.setState({ camera: "Whole car", emote: { id: MIRROR_CHECK_ID }, playbackPaused: false }); }}>{MIRROR_CHECK_NAME}<FitBadge choice={previewChoice} pose={MIRROR_CHECK_ID} /></button>}
      {!insideCar && emoteGroup === "Garage" && leanAvailable && <button type="button" className="menu-control" data-controller-row
        disabled={reducedMotion} aria-pressed={emote?.id === GARAGE_LEAN_ID}
        onClick={() => useCharacterPreviewStore.setState({ emote: { id: GARAGE_LEAN_ID } })}>{GARAGE_LEAN_NAME}</button>}
      {visibleEmotes.map(item => <button key={item.id} type="button" className="menu-control" data-controller-row
        disabled={reducedMotion || cockpitPending}
        aria-pressed={emote?.id === item.id} onClick={() => {
          if (item.id === "drive-honk") unlockVehicleAudio();
          useCharacterPreviewStore.setState({ emote: { id: item.id }, playbackPaused: false });
        }}><span className="emote-name">{item.name}</span><FitBadge choice={previewChoice} pose={item.id} /></button>)}
    </div>
    {!visibleEmotes.length && <p role="status">No emotes match this filter.</p>}
  </>;
  const poseLabel = emote?.id === MIRROR_CHECK_ID ? MIRROR_CHECK_NAME : emote?.id === GARAGE_LEAN_ID ? GARAGE_LEAN_NAME
    : pickedEmotes.find(item => item.id === emote?.id)?.name;
  const fitting = tab === "appearance";
  const rotationDisabled = insideCar || emote?.id === MIRROR_CHECK_ID;
  const vehiclePreview = tab === "emotes" && Boolean(cockpitVehicle);
  const cameraViews = vehiclePreview ? CHARACTER_CAMERAS : CHARACTER_CAMERAS.filter(view => view !== "Whole car");
  const changeCamera = (view: typeof camera) => useCharacterPreviewStore.setState({ camera: view, zoom: 1 });
  const cameraSelect = insideCar
    ? <FittingCameraSelect views={COCKPIT_CAMERAS} view={camera === "Whole car" ? "Whole car" : "Full body"}
      viewLabels={{ "Full body": "Driver", "Whole car": "Whole vehicle" }} onViewChange={changeCamera} />
    : <FittingCameraSelect choice={previewChoice} views={cameraViews}
      view={!vehiclePreview && camera === "Whole car" ? "Full body" : camera} onViewChange={changeCamera} />;
  const zoomRange = <input type="range" aria-label="Preview zoom" min={CHARACTER_ZOOM_MIN} max={CHARACTER_ZOOM_MAX} step=".05" value={zoom}
    onChange={event => useCharacterPreviewStore.setState({ zoom: Number(event.target.value) })} />;
  const zoomBy = (step: number) => useCharacterPreviewStore.setState({ zoom: Math.min(CHARACTER_ZOOM_MAX, Math.max(CHARACTER_ZOOM_MIN, +(zoom + step).toFixed(2))) });
  const togglePose = () => useCharacterPreviewStore.setState({ playbackPaused: !playbackPaused });
  const exitCockpit = insideCar && <button type="button" className="menu-control fitting-tool-icon" data-cockpit-toggle
    aria-label={`Exit ${stationName}`} title={`Exit ${stationName}`} onClick={toggleCockpit}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11 4H4v16h7m2-12 4 4-4 4m4-4H8" /></svg>
  </button>;
  const cameraTools = inspection ? cameraControls : <FittingCameraToolbar key={tab} camera={cameraSelect} zoomRange={insideCar ? undefined : zoomRange}
    visibility={<PreviewVisibilityToggle />} paused={playbackPaused} onPause={togglePose}
    vehicle={vehiclePreview} rotationDisabled={rotationDisabled} actions={exitCockpit}
    onReframe={tab !== "emotes" ? () => useCharacterPreviewStore.setState(s => ({ zoom: 1, focusRevision: s.focusRevision + 1 })) : undefined}
    zoomOutDisabled={zoom <= CHARACTER_ZOOM_MIN} zoomInDisabled={zoom >= CHARACTER_ZOOM_MAX}
    onZoomOut={insideCar ? undefined : () => zoomBy(-.05)} onZoomIn={insideCar ? undefined : () => zoomBy(.05)} />;

  if (!locked) return (
    <div ref={page} className="character-page character-page--setup" aria-label="Choose character gender" onFocus={revealCharacterControl}>
      <div className="character-stage" data-character-viewport data-character-preview={character.id} data-outfit-preview={outfit.id} />
      <section className="character-controls menu-panel-frame">
        <header className="character-description"><h2>Choose gender</h2><p>You can switch models any time during alpha.</p></header>
        {modelPicker}
        <div className="character-equip" data-controller-row>
          <ControllerAction button="A" className="menu-control" disabled={!connectedOwner || saved === undefined || status === "saving"}
            onClick={() => { queued.current.clear(); queued.current.set(choice.id, choice); void flush(); }}>
            {status === "saving" ? "Saving…" : `Confirm ${character.gender}`}
          </ControllerAction>
          <p role="status">{message || (!connectedOwner ? "Connect your player profile to confirm." : saved === undefined ? "Update the game server to choose a character." : "")}</p>
        </div>
        {insideCar && <button type="button" className="menu-control" data-cockpit-toggle onClick={toggleCockpit}>Exit {stationName}</button>}
        <h2>Preview emotes</h2>
        {emoteFilters}{emoteResults}
      </section>
      {cameraControls && <div className="dressing-toolbar">{cameraControls}</div>}
    </div>
  );

  return (
    <div ref={page} className={`character-page character-page--editor${tab === "appearance" ? " character-page--dressing" : tab === "emotes" ? " character-page--emotes" : ""}`} role="tabpanel" id="character-editor-panel" aria-labelledby={"character-editor-tab-" + tab}
      onFocus={revealCharacterControl}>
      <div className="character-stage" data-character-viewport data-character-preview={choice.id} data-outfit-preview={choice.outfit}
        aria-label={`Preview of ${character.name}`} />
      {fitting && <DressingRoom choice={previewChoice} onChange={editPreviewAppearance} onEquip={equipOutfit} onTryOn={tryOn} onLoad={loadOutfit}
        onEndPreview={loadedOutfit ? endOutfitPreview : undefined} cameraTools={cameraTools} />}
      {tab !== "appearance" && <section className="character-controls menu-panel-frame character-controls--left" aria-label={tab}>
        {tab === "identity" && <>
          <header className="character-description"><h2>Identity</h2><p>Choose how your character identifies and which model they use.</p></header>
          {modelPicker}
          <div className="character-outfits" role="group" aria-label="Character identity" data-controller-row>
            {CHARACTER_IDENTITIES.map(item => <button key={item.id} type="button" className="menu-control"
              aria-pressed={(choice.identity ?? character.gender) === item.id}
              onClick={() => update({ ...choice, identity: item.id })}>{item.label}</button>)}
          </div>
          <label className="character-setting" data-controller-row>Personality<select className="menu-control" aria-label="Character personality" value={choice.appearance?.personality ?? "friendly"}
            onChange={event => update({ ...choice, appearance: { ...characterAppearance(choice), personality: event.target.value as CharacterPersonality } })}>
            {CHARACTER_PERSONALITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <p>Click your character to play one of their personality emotes.</p>
        </>}
        {tab === "emotes" && <>
          <h2>{insideCar ? (road ? "Driving emotes" : "Station emotes") : "Preview emotes"}</h2>
          <label className="character-setting" data-controller-row>Clothing fit<select className="menu-control" aria-label="Animation clothing fit" value={appearance.animation_fit ?? "auto"}
            onChange={event => editPreviewAppearance({ ...previewChoice, appearance: { ...appearance, animation_fit: event.target.value as AnimationFit } })}>
            <option value="auto">Auto · match outfit</option><option value="full">Full skirt · more room</option><option value="fitted">Fitted · relaxed arms</option>
          </select></label>
          {emoteFilters}
          {insideCar && inspection && <div data-controller-row><button type="button" className="menu-control" data-cockpit-toggle
            onClick={toggleCockpit}>Exit {stationName}</button></div>}
        </>}
      </section>}
      {tab === "emotes" && <section className="character-controls menu-panel-frame character-controls--right" aria-label="Emote results">
        <h2>Emotes</h2>
        <div className="character-emote-results">{emoteResults}</div>
        <FitReview choice={previewChoice} pose={emote?.id ?? "standing"} poseLabel={poseLabel} />
      </section>}
      {!fitting && <div className="dressing-toolbar">{cameraTools}</div>}
      <section className="character-controls menu-panel-frame character-controls--bottom" aria-label="Save status" hidden={status === "idle"}>
        <div className="character-equip" data-controller-row>
          <p role="status">{status === "error" ? message : status === "saved" ? "Saved to your profile." : "Saving…"}</p>
          {status === "error" && <>
            <button type="button" className="menu-control" onClick={() => void flush()}>Retry</button>
            <button type="button" className="menu-control" onClick={() => {
              queued.current.clear();
              drafts.current.clear();
              setTrial(undefined);
              if (acknowledged.current) setChoice(acknowledged.current);
              setStatus("idle");
            }}>Revert unsaved</button>
          </>}
        </div>
      </section>
    </div>
  );
}
