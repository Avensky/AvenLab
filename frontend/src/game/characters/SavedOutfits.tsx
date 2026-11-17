import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestSocial } from "../../net/socialClient";
import { canEditCharacter, useUIStore } from "../../store/menus/uiStore";
import { useSocialStore } from "../../store/social/socialStore";
import { characterLook, type CharacterChoice } from "./characterCatalog";
import { clothingPieceLabel, wornClothing } from "./clothingPieces";
import { resolveCharacterWardrobe, wardrobeOverEase, WARDROBE_CORSETS, WARDROBE_WAIST_OPTIONS } from "./wardrobe";
import { getWardrobeGarment, visibleWardrobeGarments } from "./wardrobeGarments";
import { LOCAL_OUTFITS_KEY, OUTFIT_NAME_CONFLICT, readLocalOutfits, writeLocalOutfit } from "./localOutfits";
import "./savedOutfits.css";

const MAX_OUTFITS = 24;
const MAX_NAME_LENGTH = 48;

function outfitDetails(choice: CharacterChoice) {
  const visiblePieces = wornClothing(choice);
  const wardrobe = visiblePieces.includes("corset") ? resolveCharacterWardrobe(choice) : undefined;
  const corset = WARDROBE_CORSETS.find(item => item.id === wardrobe?.set);
  const pieces = Object.values(visibleWardrobeGarments(choice) ?? {}).flatMap(id => {
    const garment = getWardrobeGarment(id);
    return garment ? [garment.label] : [];
  });
  if (corset) pieces.unshift(corset.name);
  const ease = wardrobeOverEase(choice);
  const fit = WARDROBE_WAIST_OPTIONS.find(item => item.waist === wardrobe?.waist && item.ease === ease);
  if (fit) pieces.push(fit.label);
  if (pieces.length) return pieces.join(" · ");
  return choice.removedClothing?.length
    ? visiblePieces.map(clothingPieceLabel).join(" · ")
    : characterLook(choice)?.outfit.name;
}

type SavedOutfitsProps = {
  choice: CharacterChoice;
  onTryOn: (choice: CharacterChoice) => void;
  onEndPreview?: () => void;
  clearPreview?: boolean;
};

export function SavedOutfits({ choice, onTryOn, onEndPreview, clearPreview }: SavedOutfitsProps) {
  const editingAllowed = useUIStore(canEditCharacter);
  const owner = useSocialStore(({ view }) => view?.profile.progression ? view.profile.id : undefined);
  const profileOutfits = useSocialStore(state => state.view ? state.view.profile.progression?.character_outfits : state.cachedCosmetics?.character_outfits);
  const [localOutfits, setLocalOutfits] = useState(readLocalOutfits);
  const [source, setSource] = useState<"device" | "profile">(() =>
    Object.values(localOutfits).some(item => item.id === choice.id) || !Object.values(profileOutfits ?? {}).some(item => item.id === choice.id)
      ? "device" : "profile");
  const records = source === "device" ? localOutfits : profileOutfits;
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === null || event.key === LOCAL_OUTFITS_KEY) setLocalOutfits(readLocalOutfits());
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const requestPending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const entries = Object.entries(records ?? {});
  const looks = entries.filter(([, outfit]) => outfit.id === choice.id).sort(([a], [b]) => a.localeCompare(b));
  const trimmedName = name.trim();
  const existing = records && Object.hasOwn(records, trimmedName) ? records[trimmedName] : undefined;
  const saveProblem = Array.from(trimmedName).length > MAX_NAME_LENGTH || /\p{Cc}/u.test(trimmedName)
    ? "Use up to 48 characters and leave out line breaks."
    : existing && existing.id !== choice.id
      ? OUTFIT_NAME_CONFLICT
      : !existing && entries.length >= MAX_OUTFITS
        ? "Delete a saved outfit to make room for another."
        : "";

  function deviceWriteFailed(error: unknown, fallback: string) {
    setLocalOutfits(readLocalOutfits());
    setMessage(error instanceof Error && error.message === OUTFIT_NAME_CONFLICT ? OUTFIT_NAME_CONFLICT : fallback);
  }

  function saveDeviceCopy(name: string, outfit: CharacterChoice) {
    if (!canEditCharacter()) return;
    if (Object.hasOwn(localOutfits, name)) {
      setMessage(`A device outfit named ${name} already exists. Use This device to update it.`);
      return;
    }
    if (Object.keys(localOutfits).length >= MAX_OUTFITS) {
      setMessage("Delete a device outfit to make room for a copy.");
      return;
    }
    try {
      setLocalOutfits(writeLocalOutfit(name, outfit));
      setMessage(`Copied ${name} to this device.`);
    } catch (error) {
      deviceWriteFailed(error, "Browser storage could not save the copy.");
    }
  }

  async function changeOutfits(action: "character_outfit_save" | "character_outfit_delete", name: string, character?: CharacterChoice) {
    if (!canEditCharacter()) return;
    if (source === "device") {
      try {
        setLocalOutfits(writeLocalOutfit(name, character));
        if (!character) setName(current => current.trim() === name ? "" : current);
        setMessage(character ? `Saved ${name} on this device.` : `Deleted ${name} from this device.`);
      } catch (error) {
        deviceWriteFailed(error, "Browser storage could not update your outfits.");
      }
      return;
    }
    if (requestPending.current || !owner || useSocialStore.getState().view?.profile.id !== owner) return;
    requestPending.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await requestSocial(action, character ? { name, character } : { name });
      const outfits = result.character_outfits;
      if (!outfits || typeof outfits !== "object" || Array.isArray(outfits)) {
        throw new Error("The server did not confirm the saved outfits.");
      }
      useSocialStore.getState().acknowledgeProgression(owner, progression => ({
        ...progression, character_outfits: outfits as Record<string, CharacterChoice>,
      }), result);
      if (useSocialStore.getState().view?.profile.id === owner) {
        if (!character) setName(current => current.trim() === name ? "" : current);
        setMessage(character ? `Saved ${name}.` : `Deleted ${name}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the saved outfits.");
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmedName && !saveProblem) void changeOutfits("character_outfit_save", trimmedName, choice);
  }

  const profileReadOnly = source === "profile" && !owner;
  const readOnly = !editingAllowed || profileReadOnly;
  const notice = pending ? "Updating saved outfits…" : message || saveProblem;

  return <div className="saved-outfits">
    <div className="saved-outfit-sources" role="group" aria-label="Outfit storage" data-controller-row>
      {(["device", "profile"] as const).map(location => <button key={location} type="button" className="menu-control"
        aria-pressed={source === location} disabled={pending} onClick={() => {
          setSource(location);
          setMessage("");
        }}>{location === "device" ? "This device" : "Profile"}</button>)}
    </div>
    {(onEndPreview || clearPreview) && <div className={clearPreview ? "dressing-section-heading" : undefined} data-controller-row>
      <button type="button" className={clearPreview ? "dressing-section-clear menu-control" : "menu-control"}
        aria-label={clearPreview ? "Clear saved outfit preview" : undefined} data-clear-section={clearPreview || undefined}
        disabled={!onEndPreview} onClick={() => {
        onEndPreview?.();
        setName("");
        setMessage("");
        nameInput.current?.focus({ preventScroll: true });
      }}>{clearPreview ? "Clear" : "Return to equipped"}</button>
    </div>}
    <form className="saved-outfit-form" aria-label="Save current outfit" onSubmit={save}>
      <label data-controller-row>Outfit name
        <input ref={nameInput} className="menu-control" value={name} maxLength={MAX_NAME_LENGTH * 2} autoComplete="off"
          onChange={event => { setName(event.target.value); setMessage(""); }} />
      </label>
      <div data-controller-row>
        <button type="submit" className="menu-control" disabled={readOnly || pending || !trimmedName || Boolean(saveProblem)}>
          {existing?.id === choice.id ? "Update outfit" : "Save outfit"}
        </button>
        {source === "profile" && existing?.id === choice.id && <button type="button" className="menu-control" disabled={pending || !editingAllowed}
          onClick={() => saveDeviceCopy(trimmedName, existing)}>Copy profile outfit to this device</button>}
      </div>
    </form>
    {profileReadOnly && <p className="saved-outfit-message">Connect your profile to change profile saves. Cached outfits can still be tried on.</p>}
    {notice && <p className="saved-outfit-message" role="status">{notice}</p>}
    {looks.length > 0 ? <ul className="saved-outfit-list" aria-label="Saved outfits">
      {looks.map(([outfitName, outfit]) => {
        const details = outfitDetails(outfit);
        return <li key={outfitName} data-controller-row data-controller-columns="2">
          <button type="button" className="menu-control saved-outfit-preview" aria-label={`Try on ${outfitName}`} disabled={!editingAllowed} onClick={() => {
            if (!canEditCharacter()) return;
            onTryOn(outfit);
            setName(outfitName);
            setMessage(`Previewing ${outfitName}.`);
          }}>
            <strong>{outfitName}</strong>
            {details && <small>{details}</small>}
          </button>
          <button type="button" className="menu-control saved-outfit-delete" aria-label={`Delete ${outfitName}`} title={`Delete ${outfitName}`}
            disabled={readOnly || pending} onClick={() => void changeOutfits("character_outfit_delete", outfitName)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 14h10l1-14M10 9v8m4-8v8" /></svg>
          </button>
        </li>;
      })}
    </ul> : <p className="dressing-empty">No saved outfits for this character.</p>}
  </div>;
}
